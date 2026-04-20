// Re-exporting all domain services for centralized access and backward compatibility
export * from "@/services/auth-service";
export * from "@/services/project-service";
export * from "@/services/notification-service";
export * from "@/services/incentive-service";
export * from "@/services/storage-service";
export * from "@/services/system-service";
export * from "@/services/meeting-service";
export * from "@/services/import-service";
export * from "@/services/grant-service";
export * from "@/services/document-service";
export * from "./scopus-actions";
export * from "./wos-actions";
export * from "./sciencedirect-actions";
export * from "./incentive-actions";
export * from "./research-paper-actions";
export * from "./patent-actions";
export * from "./conference-actions";
export * from "./membership-actions";
export * from "./arps-actions";

// Note: Any custom logic that doesn't fit into a specific domain can be added here, 
// but most business logic should live in src/services/
