import { z } from 'zod';

export const CreateCustomerSchema = z.object({
  name:         z.string().min(1).max(255),
  phone:        z.string().max(20).optional(),
  address:      z.string().max(500).optional(),
  notes:        z.string().max(1000).optional(),
  // TS: opt-in flag for WhatsApp notifications; defaults false to match the DB column default
  has_whatsapp: z.boolean().optional().default(false),
});

// TS: partial update — all fields optional; at least one must be present to be meaningful
export const UpdateCustomerSchema = z.object({
  name:         z.string().min(1).max(255).optional(),
  phone:        z.string().max(20).optional(),
  address:      z.string().max(500).optional(),
  notes:        z.string().max(1000).optional(),
  has_whatsapp: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided to update' }
);

export const SearchCustomersQuerySchema = z.object({
  search:   z.string().max(100).optional(),
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(100).default(20),
});

export type CreateCustomerInput  = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput  = z.infer<typeof UpdateCustomerSchema>;
export type SearchCustomersQuery = z.infer<typeof SearchCustomersQuerySchema>;
