import { z } from 'zod';

export const CreateCustomerSchema = z.object({
  name:    z.string().min(1).max(255),
  phone:   z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  notes:   z.string().max(1000).optional(),
});

export const SearchCustomersQuerySchema = z.object({
  search:   z.string().max(100).optional(),
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(100).default(20),
});

export type CreateCustomerInput    = z.infer<typeof CreateCustomerSchema>;
export type SearchCustomersQuery   = z.infer<typeof SearchCustomersQuerySchema>;
