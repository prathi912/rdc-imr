import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';

export function Guidelines() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
            <Info className="h-6 w-6" />
            <CardTitle>Intramural Research Project Guidelines</CardTitle>
        </div>
        <CardDescription>
          Please read the following guidelines carefully before submitting your project.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-4">
        <p>
          In the absence of extramural research funding, faculty members can apply for intramural research projects to RDC, PU, if they wish to pursue research in their area of interest. Funding up to a maximum of Rs. 5,00,000/- for the whole project is extended to such desirous faculty members. Teachers pursuing their Ph.D. programs from PU can also apply under this project.
        </p>
        <p className="font-medium text-foreground">
          Faculty members availing fee concession and/or getting contingency grant from PU shall be ineligible for intramural research grant.
        </p>
        <div>
            <h4 className="font-semibold text-foreground mb-2">Key Conditions:</h4>
            <ul className="list-disc pl-6 space-y-2">
            <li>
                If poroject gets Approved, and a grant is awarded, transactions should be only made through your
            </li>
            <li>
                One IMR project only shall be sanctioned to a faculty member as PI, at any given point of time. However, he/she can become a Co-PI for additional IMR project(s).
            </li>
            <li>
                After completing one IMR project, a faculty member can apply for a second IMR project after submitting the 'Project outcome-cum-completion report' and Utilization Certificate. Sanction of the second IMR project shall depend on the outcome of the previously completed IMR project.
            </li>
            <li>
                Midterm evaluation of the progress of research work after every six months is mandatory. The sanctioned project would be withdrawn, if a PI skips the midterm evaluation process without offering a valid reason.
            </li>
            </ul>
        </div>
      </CardContent>
    </Card>
  );
}
