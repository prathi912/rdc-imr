import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function FirebaseNotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Firebase Configuration Required
          </CardTitle>
          <CardDescription>The application requires Firebase configuration to function properly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Missing Environment Variables</AlertTitle>
            <AlertDescription>
              Please configure the following environment variables in your deployment:
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-4 rounded-lg">
            <code className="text-sm">
              NEXT_PUBLIC_FIREBASE_API_KEY
              <br />
              NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
              <br />
              NEXT_PUBLIC_FIREBASE_PROJECT_ID
              <br />
              NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
              <br />
              NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
              <br />
              NEXT_PUBLIC_FIREBASE_APP_ID
            </code>
          </div>

          <p className="text-sm text-muted-foreground">
            Once configured, the application will automatically connect to your Firebase project.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
