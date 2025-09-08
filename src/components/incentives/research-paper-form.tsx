
"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/config"
import { collection, doc, setDoc } from "firebase/firestore"
import type { User, IncentiveClaim, Author } from "@/types"
import {
  uploadFileToServer,
} from "@/app/actions"
import { findUserByMisId } from "@/app/userfinding"
import { fetchAdvancedScopusData } from "@/app/scopus-actions";
import { fetchWosDataByUrl } from "@/app/wos-actions";
import { Loader2, AlertCircle, Bot, ChevronDown, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "../ui/checkbox"

const MAX_FILES = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_FILE_TYPES = ["application/pdf"]

const researchPaperSchema = z
  .object({
    publicationType: z.string({ required_error: "Please select a publication type." }),
    indexType: z.enum(["wos", "scopus", "both", "esci"]).optional(),
    relevantLink: z.string().url("A valid DOI link is required."),
    scopusLink: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    journalClassification: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
    wosType: z.enum(["SCIE", "SSCI", "A&HCI"]).optional(),
    journalName: z.string().min(3, "Journal name is required."),
    journalWebsite: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    paperTitle: z.string().min(5, "Paper title is required."),
    locale: z.enum(["National", "International"], { required_error: "Locale is required." }),
    printIssn: z.string().optional(),
    electronicIssn: z.string().optional(),
    publicationMonth: z.string({ required_error: "Publication month is required." }),
    publicationYear: z.string({ required_error: "Publication year is required." }),
    sdgGoals: z.array(z.string()).refine((value) => value.length > 0, { message: "Please select at least one SDG." }),
    publicationProof: z
      .any()
      .refine((files) => files?.length > 0, "Proof of publication is required.")
      .refine((files) => files?.length <= MAX_FILES, `You can upload a maximum of ${MAX_FILES} files.`)
      .refine(
        (files) => Array.from(files).every((file: any) => file.size <= MAX_FILE_SIZE),
        `Each file must be less than 5MB.`,
      )
      .refine(
        (files) => Array.from(files).every((file: any) => ACCEPTED_FILE_TYPES.includes(file.type)),
        "Only PDF files are allowed.",
      ),
    isPuNameInPublication: z
      .boolean()
      .refine((val) => val === true, { message: "PU name must be present in the publication." }),
    totalCorrespondingAuthors: z.coerce.number().min(1, "Please specify the number of corresponding authors."),
    authorPosition: z.enum(['1st', '2nd', '3rd', '4th', '5th', '6th'], { required_error: 'Please select your author position.' }),
    bookCoAuthors: z
      .array(
        z.object({
          name: z.string(),
          email: z.string().email(),
          uid: z.string().optional().nullable(),
          role: z.enum(["First Author", "Corresponding Author", "Co-Author", "First & Corresponding Author"]),
          isExternal: z.boolean(),
        }),
      )
      .min(1, "At least one author is required.").refine(data => {
      const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
      return firstAuthors.length <= 1;
    }, { message: 'Only one author can be designated as the First Author.', path: ["bookCoAuthors"] }),
    totalPuStudentAuthors: z.coerce.number().optional(),
    puStudentNames: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.indexType === "wos" || data.indexType === "both") {
        return !!data.wosType
      }
      return true
    },
    { message: "For WoS or Both, you must select a WoS Type.", path: ["wosType"] },
  )
  .refine(
    (data) => {
      const correspondingAuthors = data.bookCoAuthors.filter(
        (author) => author.role === "Corresponding Author" || author.role === "First & Corresponding Author",
      )
      return correspondingAuthors.length <= 1
    },
    { message: "Only one author can be designated as the Corresponding Author.", path: ["bookCoAuthors"] },
  )
  .refine(
    (data) => {
      if (data.indexType === "scopus" || data.indexType === "both") {
        return !!data.scopusLink && data.scopusLink.startsWith("https://www.scopus.com/")
      }
      return true
    },
    {
      message: "A valid Scopus link (starting with https://www.scopus.com/) is required.",
      path: ["scopusLink"],
    },
  )

type ResearchPaperFormValues = z.infer<typeof researchPaperSchema>

const publicationTypes = [
  "Research Articles/Short Communications",
  "Case Reports/Short Surveys",
  "Review Articles",
  "Letter to the Editor/Editorial",
  "Scopus Indexed Conference Proceedings",
]

const sdgGoalsList = [
  "Goal 1: No Poverty",
  "Goal 2: Zero Hunger",
  "Goal 3: Good Health and Well-being",
  "Goal 4: Quality Education",
  "Goal 5: Gender Equality",
  "Goal 6: Clean Water and Sanitation",
  "Goal 7: Affordable and Clean Energy",
  "Goal 8: Decent Work and Economic Growth",
  "Goal 9: Industry, Innovation and Infrastructure",
  "Goal 10: Reduced Inequality",
  "Goal 11: Sustainable Cities and Communities",
  "Goal 12: Responsible Consumption and Production",
  "Goal 13: Climate Action",
  "Goal 14: Life Below Water",
  "Goal 15: Life on Land",
  "Goal 16: Peace and Justice Strong Institutions",
  "Goal 17: Partnerships for the Goals",
]

const coAuthorRoles: Author['role'][] = ["First Author", "Corresponding Author", "Co-Author", "First & Corresponding Author"]
const authorPositions = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

const wosTypeOptions = [
  { value: "SCIE", label: "SCIE" },
  { value: "SSCI", label: "SSCI" },
  { value: "A&HCI", label: "A&HCI" },
]
const indexTypeOptions = [
  { value: "wos", label: "WoS" },
  { value: "scopus", label: "Scopus" },
  { value: "both", label: "Both" },
  { value: "esci", label: "ESCI" },
]
const journalClassificationOptions = [
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
]

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString())

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export function ResearchPaperForm() {
  const { toast } = useToast()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetching, setIsFetching] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)
  const [coPiSearchTerm, setCoPiSearchTerm] = useState("")
  const [foundCoPi, setFoundCoPi] = useState<{ uid?: string; name: string; email: string } | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const form = useForm<ResearchPaperFormValues>({
    resolver: zodResolver(researchPaperSchema),
    defaultValues: {
      publicationType: '',
      indexType: undefined,
      relevantLink: '',
      scopusLink: '',
      journalClassification: undefined,
      wosType: undefined,
      journalName: '',
      journalWebsite: '',
      paperTitle: '',
      locale: 'International',
      printIssn: '',
      electronicIssn: '',
      publicationMonth: '',
      publicationYear: '',
      sdgGoals: [],
      bookCoAuthors: [],
      isPuNameInPublication: false,
      totalCorrespondingAuthors: 1,
      totalPuStudentAuthors: 0,
      puStudentNames: '',
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "bookCoAuthors",
  })
  
  const watchAuthors = form.watch('bookCoAuthors');
  const firstAuthorExists = useMemo(() => 
    watchAuthors.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author'),
    [watchAuthors]
  );
  
  const getAvailableRoles = (currentAuthor: Author) => {
    const isCurrentAuthorFirst = currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author';
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      setUser(parsedUser)
      setBankDetailsMissing(!parsedUser.bankDetails)
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId)

      const isUserAlreadyAdded = form.getValues('bookCoAuthors').some(field => field.email.toLowerCase() === parsedUser.email.toLowerCase());
      if (!isUserAlreadyAdded) {
        append({
          name: parsedUser.name,
          email: parsedUser.email,
          uid: parsedUser.uid,
          role: "First Author",
          isExternal: false,
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const indexType = form.watch("indexType")

  const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurveda",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
    "Faculty of Engineering & Technology",
  ]

  const isSpecialFaculty = useMemo(
    () => (user?.faculty ? SPECIAL_POLICY_FACULTIES.includes(user.faculty) : false),
    [user?.faculty],
  )

  const availableIndexTypes = useMemo(
    () => (isSpecialFaculty ? indexTypeOptions.filter((o) => o.value !== "esci") : indexTypeOptions),
    [isSpecialFaculty],
  )

  const availableClassifications = useMemo(
    () =>
      isSpecialFaculty && (indexType === "wos" || indexType === "both")
        ? journalClassificationOptions.filter((o) => o.value === "Q1" || o.value === "Q2")
        : journalClassificationOptions,
    [isSpecialFaculty, indexType],
  )

  useEffect(() => {
    const currentClassification = form.getValues("journalClassification")
    if (currentClassification && !availableClassifications.find((o) => o.value === currentClassification)) {
      form.setValue("journalClassification", undefined, { shouldValidate: true })
    }
  }, [availableClassifications, form])

  useEffect(() => {
    const currentIndexType = form.getValues("indexType")
    if (currentIndexType && !availableIndexTypes.find((o) => o.value === currentIndexType)) {
      form.setValue("indexType", undefined, { shouldValidate: true })
    }
  }, [availableIndexTypes, form])

  const handleFetchScopusData = async () => {
    const link = form.getValues('scopusLink');
    if (!link) {
      toast({ variant: 'destructive', title: 'No Scopus Link', description: 'Please enter a Scopus article link to fetch data.' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
      return;
    }

    setIsFetching(true);
    toast({ title: 'Fetching Scopus Data', description: 'Please wait, this may take a moment...' });
    
    try {
        const result = await fetchAdvancedScopusData(link, user.name);
        if (result.success && result.data) {
            form.setValue('paperTitle', result.data.paperTitle, { shouldValidate: true });
            form.setValue('journalName', result.data.journalName, { shouldValidate: true });
            if (result.data.journalClassification) {
                form.setValue('journalClassification', result.data.journalClassification, { shouldValidate: true });
            }
            form.setValue('publicationMonth', result.data.publicationMonth, { shouldValidate: true });
            form.setValue('publicationYear', result.data.publicationYear, { shouldValidate: true });
            form.setValue('relevantLink', result.data.relevantLink, { shouldValidate: true });
            form.setValue('isPuNameInPublication', result.data.isPuNameInPublication, { shouldValidate: true });
            if (result.data.journalWebsite) {
                form.setValue('journalWebsite', result.data.journalWebsite, { shouldValidate: true });
            }
            if (result.data.printIssn) {
                form.setValue('printIssn', result.data.printIssn, { shouldValidate: true });
            }
            if (result.data.electronicIssn) {
                form.setValue('electronicIssn', result.data.electronicIssn, { shouldValidate: true });
            }
            toast({ title: 'Success', description: 'Form fields have been pre-filled from Scopus.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data from Scopus.' });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFetching(false);
    }
  };

  const handleFetchWosData = async () => {
    const link = form.getValues('relevantLink');
    if (!link) {
      toast({ variant: 'destructive', title: 'No Link Provided', description: 'Please enter a WoS article link to fetch data.' });
      return;
    }
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant. Please log in again.' });
        return;
    }

    setIsFetching(true);
    toast({ title: 'Fetching WoS Data', description: 'Please wait...' });

    try {
        const result = await fetchWosDataByUrl(link, user.name);
        if (result.success && result.data) {
            form.setValue('paperTitle', result.data.paperTitle, { shouldValidate: true });
            form.setValue('journalName', result.data.journalName, { shouldValidate:true });
            form.setValue('publicationYear', result.data.publicationYear, { shouldValidate: true });
            form.setValue('relevantLink', result.data.relevantLink, { shouldValidate: true });
            toast({ title: 'Success', description: 'Form fields have been pre-filled from Web of Science.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFetching(false);
    }
  };

  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm) return
    setIsSearching(true)
    setFoundCoPi(null)
    try {
      const result = await findUserByMisId(coPiSearchTerm)
      if (result.success && result.users && result.users.length > 0) {
        const user = result.users[0]
        setFoundCoPi({ ...user })
      } else {
        toast({ variant: "destructive", title: "User Not Found", description: result.error })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Search Failed", description: "An error occurred while searching." })
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddCoPi = () => {
    if (foundCoPi && !fields.some((field) => field.email.toLowerCase() === foundCoPi.email.toLowerCase())) {
      if (user && foundCoPi.email.toLowerCase() === user.email.toLowerCase()) {
        toast({ variant: "destructive", title: "Cannot Add Self", description: "You cannot add yourself again." })
        return
      }
      append({
        name: foundCoPi.name,
        email: foundCoPi.email,
        uid: foundCoPi.uid,
        role: "Co-Author",
        isExternal: false,
      })
    }
    setFoundCoPi(null)
    setCoPiSearchTerm("")
  }

  const removeAuthor = (index: number) => {
    const authorToRemove = fields[index];
    if (authorToRemove.email === user?.email) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot remove yourself as the primary author.' });
      return;
    }
    remove(index);
  };

  async function handleSave(status: "Draft" | "Pending") {
    if (!user || !user.faculty) {
      toast({ variant: "destructive", title: "Error", description: "User information not found. Please log in again." })
      return
    }
    // Re-check profile completeness on submission
    if (status === "Pending" && (!user.bankDetails || !user.orcidId || !user.misId)) {
      toast({
        variant: "destructive",
        title: "Profile Incomplete",
        description: "Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const data = form.getValues()
      const claimId = doc(collection(db, "incentiveClaims")).id

      const uploadFilesAndGetUrls = async (files: FileList | undefined, folderName: string): Promise<string[]> => {
        if (!files || files.length === 0 || !user) return []
        const uploadPromises = Array.from(files).map(async (file) => {
          const dataUrl = await fileToDataUrl(file)
          const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`
          const result = await uploadFileToServer(dataUrl, path)
          if (!result.success || !result.url) {
            throw new Error(result.error || `File upload failed for ${file.name}`)
          }
          return result.url
        })
        return Promise.all(uploadPromises)
      }

      const publicationProofUrls = await uploadFilesAndGetUrls(data.publicationProof, "publication-proof")

      const { publicationProof, ...restOfData } = data

      const claimData: Omit<IncentiveClaim, "id"> = {
        ...restOfData,
        publicationProofUrls,
        misId: user.misId || null,
        orcidId: user.orcidId || null,
        claimType: "Research Papers",
        benefitMode: "incentives",
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails || null,
        totalPuAuthors: data.bookCoAuthors.length, // Add total PU authors
      }

      // Sanitize data: remove undefined fields
      Object.keys(claimData).forEach(key => {
        if ((claimData as any)[key] === undefined) {
          delete (claimData as any)[key];
        }
      });

      await setDoc(doc(db, "incentiveClaims", claimId), claimData)

      if (status === "Draft") {
        toast({ title: "Draft Saved!", description: "You can continue editing from the 'Incentive Claim' page." })
        router.push(`/dashboard/incentive-claim/research-paper?claimId=${claimId}`)
      } else {
        toast({ title: "Success", description: "Your incentive claim has been submitted." })
        router.push("/dashboard/incentive-claim")
      }
    } catch (error: any) {
      console.error("Error submitting claim: ", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit claim. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => handleSave("Pending"))}>
            <CardContent className="space-y-6 pt-6">
              {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Profile Incomplete</AlertTitle>
                  <AlertDescription>
                    An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them
                    to your profile.
                    <Button asChild variant="link" className="p-1 h-auto">
                      <Link href="/dashboard/settings">Go to Settings</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">RESEARCH PAPER DETAILS</h3>
                <Separator />
                
                <FormField
                  control={form.control}
                  name="publicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type of Publication</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select publication type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {publicationTypes.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="indexType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Select Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-wrap items-center gap-x-6 gap-y-2"
                          disabled={isSubmitting}
                        >
                          {availableIndexTypes.map((option) => (
                            <FormItem key={option.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={option.value} />
                              </FormControl>
                              <FormLabel className="font-normal">{option.label}</FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(indexType === 'scopus' || indexType === 'both') && (
                  <FormField
                      control={form.control}
                      name="scopusLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scopus Article Link</FormLabel>
                          <div className="flex items-center gap-2">
                              <FormControl>
                                  <Input placeholder="https://www.scopus.com/record/..." {...field} disabled={isSubmitting} />
                              </FormControl>
                              <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleFetchScopusData}
                                  disabled={isSubmitting || isFetching || !form.getValues('scopusLink')}
                                  title="Fetch data from Scopus"
                              >
                                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                  Fetch Data
                              </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                )}
                
                 {(indexType === 'wos' || indexType === 'both') && (
                    <FormField
                      control={form.control}
                      name="relevantLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WoS Article Link (DOI)</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input placeholder="https://doi.org/..." {...field} disabled={isSubmitting} />
                            </FormControl>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleFetchWosData}
                                disabled={isSubmitting || isFetching || !form.getValues('relevantLink')}
                                title="Fetch data from Web of Science"
                            >
                                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                Fetch Data
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                )}


                <FormField
                  control={form.control}
                  name="journalClassification"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Journal Classification</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-wrap items-center gap-x-6 gap-y-2"
                          disabled={isSubmitting}
                        >
                          {availableClassifications.map((option) => (
                            <FormItem key={option.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={option.value} />
                              </FormControl>
                              <FormLabel className="font-normal">{option.label}</FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(indexType === "wos" || indexType === "both") && (
                  <FormField
                    control={form.control}
                    name="wosType"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Type of WoS</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex items-center space-x-6"
                          >
                            <FormItem key={field.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="SCIE" />
                              </FormControl>
                              <FormLabel className="font-normal">SCIE</FormLabel>
                            </FormItem>
                            <FormItem key={field.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="SSCI" />
                              </FormControl>
                              <FormLabel className="font-normal">SSCI</FormLabel>
                            </FormItem>
                            <FormItem key={field.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="A&HCI" />
                              </FormControl>
                              <FormLabel className="font-normal">A&HCI</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <Separator />
                <FormField
                  control={form.control}
                  name="journalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name of Journal/Proceedings</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the full name of the journal or proceedings"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="journalWebsite"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Journal Website Link</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.examplejournal.com" {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paperTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title of the Paper published</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter the full title of your paper" {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="relevantLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DOI Link</FormLabel>
                      <FormControl>
                        <Input placeholder="https://doi.org/..." {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="locale"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Locale</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex items-center space-x-6"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="National" />
                            </FormControl>
                            <FormLabel className="font-normal">National</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="International" />
                            </FormControl>
                            <FormLabel className="font-normal">International</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="printIssn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Print ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 1234-5678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="electronicIssn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Electronic ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 8765-4321" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="publicationMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publication Month</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {months.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publicationYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publication Year</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {years.map((y) => (
                              <SelectItem key={y} value={y}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Separator />
                <div className="space-y-4">
                  <FormLabel>Author(s) from PU</FormLabel>
                  <div className="space-y-2">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-3 rounded-md items-center"
                      >
                        <FormItem className="md:col-span-2">
                          <FormLabel className="text-xs">Name</FormLabel>
                          <FormControl>
                            <Input value={field.name} readOnly />
                          </FormControl>
                        </FormItem>
                        <FormField
                          control={form.control}
                          name={`bookCoAuthors.${index}.role`}
                          render={({ field: roleField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Role</FormLabel>
                              <Select onValueChange={roleField.onChange} value={roleField.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {getAvailableRoles(field).map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {role}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {field.email.toLowerCase() !== user?.email.toLowerCase() && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="md:col-start-4 justify-self-end mt-2"
                            onClick={() => removeAuthor(index)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 p-3 border rounded-md">
                    <FormLabel className="text-sm">Add PU Co-Author</FormLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Search by Co-PI's MIS ID"
                        value={coPiSearchTerm}
                        onChange={(e) => setCoPiSearchTerm(e.target.value)}
                      />
                      <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                      </Button>
                    </div>
                    {foundCoPi && (
                      <div className="flex items-center justify-between p-2 border rounded-md mt-2">
                        <div>
                          <p className="text-sm">{foundCoPi.name}</p>
                        </div>
                        <Button type="button" size="sm" onClick={handleAddCoPi}>
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  <FormMessage>
                    {form.formState.errors.bookCoAuthors?.message || form.formState.errors.bookCoAuthors?.root?.message}
                  </FormMessage>
                </div>
                <Separator />
                <FormField
                    control={form.control}
                    name="authorPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Author Position</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your position" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {authorPositions.map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {pos}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="totalCorrespondingAuthors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total No. of Corresponding Authors</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalPuStudentAuthors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total No. of Student Authors from PU</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="puStudentNames"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name(s) of Student Author(s)</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />
                <FormField
                  control={form.control}
                  name="isPuNameInPublication"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Is "Parul University" name present in the publication?
                        </FormLabel>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sdgGoals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UN Sustainable Development Goals (SDGs)</FormLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between font-normal">
                            {field.value?.length > 0 ? `${field.value.length} selected` : "Select relevant goals"}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
                          <DropdownMenuLabel>Select all that apply</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {sdgGoalsList.map((goal) => (
                            <DropdownMenuCheckboxItem
                              key={goal}
                              checked={field.value?.includes(goal)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...(field.value || []), goal])
                                  : field.onChange(field.value?.filter((value) => value !== goal))
                              }}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {goal}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                       <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="publicationProof"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>
                        Attach Proof: Publication: Copy of paper, title of the paper details with PU Name.*
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...fieldProps}
                          type="file"
                          multiple
                          onChange={(e) => onChange(e.target.files)}
                          accept="application/pdf"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSave("Draft")}
                disabled={isSubmitting || orcidOrMisIdMissing || bankDetailsMissing}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save as Draft
              </Button>
              <Button type="submit" disabled={isSubmitting || orcidOrMisIdMissing || bankDetailsMissing}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Submitting..." : "Submit Claim"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
