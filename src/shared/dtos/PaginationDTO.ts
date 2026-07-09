import { BadRequestError } from "../../errors/domains/BadRequestError";

export type SortDir = "asc" | "desc";

/** A search facet (e.g. region) with its value counts, for filter-chip UIs. */
export type FacetResult = {
  field: string;
  counts: { value: string; count: number }[];
};

export type PaginatedRequestDTO<K extends string> = {
  page?: number;
  pageSize?: number;
} & (
  | { orderBy?: undefined; order?: undefined }
  | { orderBy: K; order?: SortDir }
);

export type PaginatedResponseDTO<T, K extends string> = {
  data: T[];
  page: number;
  pageSize: number;
  order: SortDir;
  orderBy?: K;
  total: number;
  totalPages: number;
  /** Optional facet counts (only populated by faceted search paths). */
  facets?: FacetResult[];
};

export function normalizePagination<K extends string>(
  input: PaginatedRequestDTO<K>,
  allowedOrderBy: readonly K[],
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 10;

  if (input.orderBy && !allowedOrderBy.includes(input.orderBy)) {
    throw BadRequestError.OrderByKeyNotAllowed(input.orderBy);
  }

  const order: SortDir = input.orderBy ? (input.order ?? "desc") : "desc";
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return {
    page,
    pageSize,
    order,
    orderBy: input.orderBy,
    skip,
    take,
  };
}

export function buildPaginatedResponse<T, K extends string>(
  data: T[],
  total: number,
  meta: { page: number; pageSize: number; order: SortDir; orderBy?: K },
): PaginatedResponseDTO<T, K> {
  const totalPages = Math.max(1, Math.ceil(total / meta.pageSize));
  return { data, total, totalPages, ...meta };
}
