import { PAGE_SIZES } from "../../shared/pagination.ts";
export function Pagination({
  page,
  pages,
  size,
  start,
  end,
  total,
  onPage,
  onSize,
}: {
  page: number;
  pages: number;
  size: number;
  start: number;
  end: number;
  total: number;
  onPage: (n: number) => void;
  onSize: (n: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        {start}–{end} of {total}
      </span>
      <label>
        Per page{" "}
        <select
          aria-label="Items per page"
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span aria-live="polite">
          {page} / {pages}
        </span>
        <button
          className="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
