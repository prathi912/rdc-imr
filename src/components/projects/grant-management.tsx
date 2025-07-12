"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import type { Project, User, GrantPhase } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { addGrantPhase, addTransaction, updatePhaseStatus } from "@/app/actions"
import { useState } from "react"
import {
  DollarSign,
  Banknote,
  FileText,
  CheckCircle,
  PlusCircle,
  AlertCircle,
  BadgeCent,
  ChevronDown,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Textarea } from "../ui/textarea"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import Link from "next/link"
import { Badge } from "../ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"

interface GrantManagementProps {
  project: Project
  user: User
  onUpdate: (updatedProject: Project) => void
}

const addPhaseSchema = z.object({
  name: z.string().min(3, "Phase name is required."),
  amount: z.coerce.number().positive("Amount must be a positive number."),
})

const transactionSchema = z
  .object({
    dateOfTransaction: z.string().min(1, "Transaction date is required."),
    amount: z.coerce.number().positive("Amount must be a positive number."),
    vendorName: z.string().min(2, "Vendor name is required."),
    isGstRegistered: z.boolean().default(false),
    gstNumber: z.string().optional(),
    description: z.string().min(10, "Description is required."),
    invoice: z.any().optional(), // For file input
  })
  .refine(
    (data) => {
      if (data.isGstRegistered) {
        return !!data.gstNumber && data.gstNumber.length > 0
      }
      return true
    },
    {
      message: "GST number is required for registered vendors.",
      path: ["gstNumber"],
    },
  )

export function GrantManagement({ project, user, onUpdate }: GrantManagementProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddPhaseOpen, setIsAddPhaseOpen] = useState(false)
  const [isTransactionOpen, setIsTransactionOpen] = useState(false)
  const [currentPhaseId, setCurrentPhaseId] = useState<string | null>(null)

  const isAdmin = user.role === "admin" || user.role === "Super-admin" || user.role === "CRO"
  const isPI = user.uid === project.pi_uid || user.email === project.pi_email
  const grant = project.grant

  const phaseForm = useForm<z.infer<typeof addPhaseSchema>>({
    resolver: zodResolver(addPhaseSchema),
    defaultValues: { name: "", amount: 0 },
  })

  const transactionForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      dateOfTransaction: "",
      amount: 0,
      vendorName: "",
      isGstRegistered: false,
      gstNumber: "",
      description: "",
    },
  })

  const handleAddPhase = async (values: z.infer<typeof addPhaseSchema>) => {
    if (!grant) return
    setIsSubmitting(true)
    try {
      const result = await addGrantPhase(project.id, values.name, values.amount)
      if (result.success && result.updatedProject) {
        onUpdate(result.updatedProject)
        toast({ title: "Success", description: "New grant phase added." })
        phaseForm.reset()
        setIsAddPhaseOpen(false)
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to add new phase." })
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Error", description: "Failed to add new phase." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddTransaction = async (values: z.infer<typeof transactionSchema>) => {
    if (!grant || !currentPhaseId) return
    setIsSubmitting(true)
    try {
      const invoiceFile = values.invoice?.[0]
      const result = await addTransaction(project.id, currentPhaseId, {
        dateOfTransaction: values.dateOfTransaction,
        amount: values.amount,
        vendorName: values.vendorName,
        isGstRegistered: values.isGstRegistered,
        gstNumber: values.gstNumber,
        description: values.description,
        invoiceFile: invoiceFile,
      })

      if (result.success && result.updatedProject) {
        onUpdate(result.updatedProject)
        toast({ title: "Success", description: "Transaction added successfully." })
        transactionForm.reset()
        setIsTransactionOpen(false)
        setCurrentPhaseId(null)
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to add transaction." })
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Error", description: "Failed to add transaction." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePhaseStatusUpdate = async (phaseId: string, newStatus: GrantPhase["status"]) => {
    if (!grant) return
    setIsSubmitting(true)
    try {
      const result = await updatePhaseStatus(project.id, phaseId, newStatus)
      if (result.success && result.updatedProject) {
        onUpdate(result.updatedProject)
        toast({ title: "Success", description: `Phase status updated to ${newStatus}.` })
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to update phase status." })
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Error", description: "Failed to update phase status." })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!grant) return null

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <CardTitle>Grant Management</CardTitle>
          </div>
          {isAdmin && (
            <Dialog open={isAddPhaseOpen} onOpenChange={setIsAddPhaseOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Grant Phase
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Grant Phase</DialogTitle>
                  <DialogDescription>Define a new disbursement phase for this project.</DialogDescription>
                </DialogHeader>
                <Form {...phaseForm}>
                  <form
                    id="add-phase-form"
                    onSubmit={phaseForm.handleSubmit(handleAddPhase)}
                    className="space-y-4 py-4"
                  >
                    <FormField
                      name="name"
                      control={phaseForm.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phase Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Phase 2 - Consumables" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="amount"
                      control={phaseForm.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" form="add-phase-form" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add Phase"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <CardDescription className="mt-2">
          Total grant amount:{" "}
          <span className="font-bold text-foreground">₹{(grant.totalAmount || 0).toLocaleString("en-IN")}</span> |
          Sanction No: <span className="font-bold text-foreground">{grant.sanctionNumber || "N/A"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(grant.phases || []).map((phase) => {
          const totalUtilized = phase.transactions?.reduce((acc, t) => acc + t.amount, 0) || 0
          return (
            <Card key={phase.id} className="bg-muted/30">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{phase.name}</CardTitle>
                    <CardDescription className="mt-1">
                      Amount:{" "}
                      <span className="font-semibold text-foreground">₹{phase.amount.toLocaleString("en-IN")}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={phase.status === "Disbursed" ? "default" : "secondary"}>{phase.status}</Badge>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" disabled={isSubmitting}>
                            Change Status <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => handlePhaseStatusUpdate(phase.id, "Pending Disbursement")}
                            disabled={phase.status === "Pending Disbursement"}
                          >
                            Pending Disbursement
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handlePhaseStatusUpdate(phase.id, "Disbursed")}
                            disabled={phase.status === "Disbursed"}
                          >
                            Disbursed
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handlePhaseStatusUpdate(phase.id, "Completed")}
                            disabled={phase.status === "Completed"}
                          >
                            Completed
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                {phase.disbursementDate && (
                  <p className="text-sm text-muted-foreground">
                    Disbursed on: {new Date(phase.disbursementDate).toLocaleDateString()}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Allocated</p>
                      <p className="font-semibold">₹{phase.amount.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgeCent className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Utilized</p>
                      <p className="font-semibold">₹{totalUtilized.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="font-semibold">₹{(phase.amount - totalUtilized).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                {phase.transactions && phase.transactions.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Transactions ({phase.transactions.length})
                      </h4>
                      {isPI && phase.status === "Disbursed" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setCurrentPhaseId(phase.id)
                            setIsTransactionOpen(true)
                          }}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add Expense
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>GST</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Invoice</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phase.transactions.map((transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell>{new Date(transaction.dateOfTransaction).toLocaleDateString()}</TableCell>
                              <TableCell>{transaction.vendorName}</TableCell>
                              <TableCell>₹{transaction.amount.toLocaleString("en-IN")}</TableCell>
                              <TableCell>
                                {transaction.isGstRegistered ? (
                                  <span className="text-green-600">Yes ({transaction.gstNumber})</span>
                                ) : (
                                  <span className="text-muted-foreground">No</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                              <TableCell>
                                {transaction.invoiceUrl ? (
                                  <Link
                                    href={transaction.invoiceUrl}
                                    target="_blank"
                                    className="text-blue-600 hover:underline"
                                  >
                                    View Invoice
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">N/A</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No transactions recorded for this phase.</p>
                    {isPI && phase.status === "Disbursed" && (
                      <Button
                        onClick={() => {
                          setCurrentPhaseId(phase.id)
                          setIsTransactionOpen(true)
                        }}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add First Expense
                      </Button>
                    )}
                  </div>
                )}

                {/* Warning for over-utilization */}
                {totalUtilized > phase.amount && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Over-utilization Warning</AlertTitle>
                    <AlertDescription>
                      This phase has been over-utilized by ₹{(totalUtilized - phase.amount).toLocaleString("en-IN")}.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )
        })}

        {/* Add Transaction Dialog */}
        <Dialog open={isTransactionOpen} onOpenChange={setIsTransactionOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
              <DialogDescription>Record a new expense for this grant phase.</DialogDescription>
            </DialogHeader>
            <Form {...transactionForm}>
              <form
                id="add-transaction-form"
                onSubmit={transactionForm.handleSubmit(handleAddTransaction)}
                className="space-y-4 py-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    name="dateOfTransaction"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transaction Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="amount"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="vendorName"
                  control={transactionForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter vendor/supplier name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center space-x-2">
                  <Switch
                    id="gst-registered"
                    checked={transactionForm.watch("isGstRegistered")}
                    onCheckedChange={(checked) => transactionForm.setValue("isGstRegistered", checked)}
                  />
                  <Label htmlFor="gst-registered">Vendor is GST registered</Label>
                </div>

                {transactionForm.watch("isGstRegistered") && (
                  <FormField
                    name="gstNumber"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GST Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter GST number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  name="description"
                  control={transactionForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Describe the purchase/expense" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="invoice"
                  control={transactionForm.control}
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Invoice (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" form="add-transaction-form" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Transaction"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
