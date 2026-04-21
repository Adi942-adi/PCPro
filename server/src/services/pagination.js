export const parsePagination = (query = {}, options = {}) => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const maxLimit = Number.isFinite(Number(options.maxLimit)) ? Math.max(1, Number(options.maxLimit)) : 100;
  const defaultLimit = Number.isFinite(Number(options.defaultLimit))
    ? Math.max(1, Math.min(Number(options.defaultLimit), maxLimit))
    : 20;

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const createPaginationMeta = ({ page, limit, total }) => {
  const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : 0;
  return {
    page,
    limit,
    total: safeTotal,
    totalPages: Math.max(1, Math.ceil(safeTotal / Math.max(1, limit)))
  };
};

export const paginateArray = (items = [], { page, limit }) => {
  const list = Array.isArray(items) ? items : [];
  const start = Math.max(0, (page - 1) * limit);
  const end = start + limit;
  return list.slice(start, end);
};
