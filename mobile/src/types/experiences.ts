export interface ExperiencePackage {
  id: number;
  version: number;
  name: string;
  description: string;
  mode: 'VIDEO' | 'AR';
  price: number;
  validityDays: number;
  revisionsIncluded: number;
  minLeadHours: number;
  paymentRequirement: 'FULL' | 'DEPOSIT';
  isActive: boolean;
  templateId: number | null;
  sortOrder: number;
}
