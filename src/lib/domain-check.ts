import { getSystemSettings } from "@/app/actions"

export async function isEmailDomainAllowed(email: string): Promise<{ allowed: boolean; isCro: boolean }> {
  try {
    const settings = await getSystemSettings()
    const allowedDomains = settings.allowedDomains || ["@paruluniversity.ac.in", "@goa.paruluniversity.ac.in"]
    const croDomains = settings.croDomains || ["@paruluniversity.ac.in"]

    // Special case for primary super admin
    if (email === "rathipranav07@gmail.com") {
      return { allowed: true, isCro: false }
    }

    const isAllowed = allowedDomains.some((domain) => email.endsWith(domain))
    const isCro = croDomains.some((domain) => email.endsWith(domain))

    return { allowed: isAllowed, isCro }
  } catch (error) {
    console.error("Error checking email domain:", error)
    // Default to original domains on error
    const defaultAllowed = email.endsWith("@paruluniversity.ac.in") || email.endsWith("@goa.paruluniversity.ac.in")
    const defaultIsCro = email.endsWith("@paruluniversity.ac.in")
    return { allowed: defaultAllowed, isCro: defaultIsCro }
  }
}
