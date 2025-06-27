import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncentiveForm } from '@/components/incentives/incentive-form';
import { Card, CardContent } from '@/components/ui/card';

export default function IncentiveClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Paper Publication Incentive Claim"
        description="Submit your claim for a paper publication incentive."
        showBackButton={false}
      />
      <div className="mt-8">
        <Tabs defaultValue="apply" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="apply">Apply</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="accepted">Accepted</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          <TabsContent value="apply">
            <IncentiveForm />
          </TabsContent>
          <TabsContent value="pending">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">You have no pending claims.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="accepted">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">You have no accepted claims.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="rejected">
            <Card>
              <CardContent className="pt-6">
                 <p className="text-center text-muted-foreground">You have no rejected claims.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
