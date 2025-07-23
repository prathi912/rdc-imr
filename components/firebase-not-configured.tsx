import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export function FirebaseNotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Configuration Required
          </CardTitle>
          <CardDescription>Firebase configuration is missing or incomplete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Please configure the following environment variables:</AlertDescription>
          </Alert>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• NEXT_PUBLIC_FIREBASE_API_KEY</li>
            <li>• NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</li>
            <li>• NEXT_PUBLIC_FIREBASE_PROJECT_ID</li>
            <li>• NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET</li>
            <li>• NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID</li>
            <li>• NEXT_PUBLIC_FIREBASE_APP_ID</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Add these variables to your environment configuration to enable the application.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
