"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/page-header"

interface TestResult {
  status: "success" | "error" | "warning"
  message: string
  [key: string]: any
}

interface HealthCheckResult {
  timestamp: string
  overallStatus: "success" | "error"
  message: string
  tests: {
    firestore: TestResult
    auth: TestResult
    storage: TestResult
    serviceAccount: TestResult
  }
  debug: {
    environment: {
      hasServiceAccount: boolean
      hasProjectId: boolean
      hasStorageBucket: boolean
      projectId: string
      storageBucket: string
    }
    initialization: string
  }
}

export default function SystemHealthPage() {
  const [healthData, setHealthData] = useState<HealthCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runHealthCheck = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/test-firebase")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || "Health check failed")
      }

      setHealthData(data)
    } catch (err: any) {
      setError(err.message)
      console.error("Health check error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      success: "default",
      error: "destructive",
      warning: "secondary",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "outline"}>{status.toUpperCase()}</Badge>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="System Health" description="Monitor the health and connectivity of Firebase services" />

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {healthData && (
            <>
              {getStatusIcon(healthData.overallStatus)}
              <span className="font-medium">{healthData.message}</span>
              {getStatusBadge(healthData.overallStatus)}
            </>
          )}
        </div>

        <Button onClick={runHealthCheck} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run Health Check
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Health Check Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {healthData && (
        <>
          {/* Debug Information */}
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
              <CardDescription>Environment and initialization details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium mb-2">Environment Variables</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span>Service Account:</span>
                      <span
                        className={healthData.debug.environment.hasServiceAccount ? "text-green-600" : "text-red-600"}
                      >
                        {healthData.debug.environment.hasServiceAccount ? "✓" : "✗"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Project ID:</span>
                      <span className={healthData.debug.environment.hasProjectId ? "text-green-600" : "text-red-600"}>
                        {healthData.debug.environment.hasProjectId ? "✓" : "✗"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Storage Bucket:</span>
                      <span
                        className={healthData.debug.environment.hasStorageBucket ? "text-green-600" : "text-red-600"}
                      >
                        {healthData.debug.environment.hasStorageBucket ? "✓" : "✗"}
                      </span>
                    </div>
                  </div>
                  {healthData.debug.environment.projectId && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Project: {healthData.debug.environment.projectId}
                    </p>
                  )}
                  {healthData.debug.environment.storageBucket && (
                    <p className="text-sm text-muted-foreground">
                      Bucket: {healthData.debug.environment.storageBucket}
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium mb-2">Initialization</h4>
                  <p className="text-sm text-muted-foreground">{healthData.debug.initialization}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Service Account Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Service Account</span>
                  {getStatusIcon(healthData.tests.serviceAccount.status)}
                </CardTitle>
                <CardDescription>Service account configuration and parsing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.serviceAccount.status)}
                  </div>
                  {healthData.tests.serviceAccount.projectId && (
                    <div className="flex justify-between">
                      <span>Project ID:</span>
                      <span className="text-sm font-mono">{healthData.tests.serviceAccount.projectId}</span>
                    </div>
                  )}
                  {healthData.tests.serviceAccount.clientEmail && (
                    <div className="flex justify-between">
                      <span>Client Email:</span>
                      <span className="text-sm font-mono break-all">{healthData.tests.serviceAccount.clientEmail}</span>
                    </div>
                  )}
                  {healthData.tests.serviceAccount.hasPrivateKey !== undefined && (
                    <div className="flex justify-between">
                      <span>Has Private Key:</span>
                      <span>{healthData.tests.serviceAccount.hasPrivateKey ? "Yes" : "No"}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.serviceAccount.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firestore Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firestore Database</span>
                  {getStatusIcon(healthData.tests.firestore.status)}
                </CardTitle>
                <CardDescription>Database connectivity and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.firestore.status)}
                  </div>
                  <div className="flex justify-between">
                    <span>Can Read:</span>
                    <span>{healthData.tests.firestore.canRead ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Can Write:</span>
                    <span>{healthData.tests.firestore.canWrite ? "Yes" : "No"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.firestore.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firebase Auth Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firebase Authentication</span>
                  {getStatusIcon(healthData.tests.auth.status)}
                </CardTitle>
                <CardDescription>Authentication service connectivity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.auth.status)}
                  </div>
                  {healthData.tests.auth.userCount !== undefined && (
                    <div className="flex justify-between">
                      <span>Users Found:</span>
                      <span>{healthData.tests.auth.userCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Can List Users:</span>
                    <span>{healthData.tests.auth.canListUsers ? "Yes" : "No"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.auth.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firebase Storage Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firebase Storage</span>
                  {getStatusIcon(healthData.tests.storage.status)}
                </CardTitle>
                <CardDescription>File storage connectivity and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.storage.status)}
                  </div>
                  {healthData.tests.storage.bucketExists !== undefined && (
                    <div className="flex justify-between">
                      <span>Bucket Exists:</span>
                      <span>{healthData.tests.storage.bucketExists ? "Yes" : "No"}</span>
                    </div>
                  )}
                  {healthData.tests.storage.bucketName && (
                    <div className="flex justify-between">
                      <span>Bucket:</span>
                      <span className="text-sm font-mono">{healthData.tests.storage.bucketName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Can List Files:</span>
                    <span>{healthData.tests.storage.canListFiles ? "Yes" : "No"}</span>
                  </div>
                  {healthData.tests.storage.fileCount !== undefined && (
                    <div className="flex justify-between">
                      <span>Files Found:</span>
                      <span>{healthData.tests.storage.fileCount}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.storage.message}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last Check Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <p>Timestamp: {new Date(healthData.timestamp).toLocaleString()}</p>
                <p>Overall Status: {healthData.overallStatus}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
