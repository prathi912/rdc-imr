import { User, Project } from '@/types';

export interface DebugInfo {
  userInfo: {
    uid: string;
    email: string;
    role: string;
    designation?: string;
    institute?: string;
    isPrincipal: boolean;
  };
  queryInfo: {
    shouldFilterByInstitute: boolean;
    instituteFilter?: string;
    hasInstituteValue: boolean;
  };
  dataInfo: {
    totalProjectsFound: number;
    instituteValues: string[];
  };
}

export function createDebugInfo(
  user: User, 
  projects: Project[]
): DebugInfo {
  const isPrincipal = user.designation === 'Principal';
  
  // Get unique institute values from projects
  const instituteValues = [...new Set(projects.map(p => p.institute).filter(Boolean) as string[])];
  
  return {
    userInfo: {
      uid: user.uid,
      email: user.email,
      role: user.role,
      designation: user.designation,
      institute: user.institute,
      isPrincipal,
    },
    queryInfo: {
      shouldFilterByInstitute: isPrincipal && !!user.institute,
      instituteFilter: user.institute,
      hasInstituteValue: !!user.institute,
    },
    dataInfo: {
      totalProjectsFound: projects.length,
      instituteValues,
    }
  };
}

export function logDebugInfo(debugInfo: DebugInfo, context: string) {
  console.groupCollapsed(`[DEBUG] Principal View - ${context}`);
  console.log('User Info:', debugInfo.userInfo);
  console.log('Query Info:', debugInfo.queryInfo);
  console.log('Data Info:', debugInfo.dataInfo);
  
  // Highlight potential issues
  if (debugInfo.userInfo.isPrincipal) {
    if (!debugInfo.userInfo.institute) {
      console.warn('Potential Issue: Principal user has no institute value set in their profile.');
    }
    if (debugInfo.dataInfo.totalProjectsFound === 0 && debugInfo.queryInfo.shouldFilterByInstitute) {
      console.warn(`Potential Issue: No projects found for institute "${debugInfo.queryInfo.instituteFilter}". Checking for data mismatches.`);
      const matches = findInstituteMatches(debugInfo.userInfo.institute, debugInfo.dataInfo.instituteValues);
      if (matches.suggestions.length > 0) {
        console.info(`Found potential name variations for this institute:`, matches.suggestions);
      } else {
        console.log(`No projects found with any variation of the institute name "${debugInfo.userInfo.institute}".`);
      }
    }
  }
  console.groupEnd();
}

export function findInstituteMatches(userInstitute: string | undefined, projectInstitutes: string[]): {
  exactMatches: string[];
  partialMatches: string[];
  suggestions: string[];
} {
  if (!userInstitute) {
    return { exactMatches: [], partialMatches: [], suggestions: projectInstitutes };
  }
  
  const userInstituteNormalized = userInstitute.toLowerCase().trim();
  const exactMatches: string[] = [];
  const partialMatches: string[] = [];
  
  projectInstitutes.forEach(institute => {
    const instituteNormalized = institute.toLowerCase().trim();
    if (instituteNormalized === userInstituteNormalized) {
      exactMatches.push(institute);
    } else if (instituteNormalized.includes(userInstituteNormalized) || userInstituteNormalized.includes(instituteNormalized)) {
      partialMatches.push(institute);
    }
  });
  
  return {
    exactMatches,
    partialMatches,
    suggestions: exactMatches.length === 0 ? partialMatches : []
  };
}
