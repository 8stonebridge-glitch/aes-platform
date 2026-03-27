import * as React from "react";

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data available",
  onRowClick,
  className = "",
}: TableProps<T>) {
  if (data.length === 0) {
    return <div className="aes-table-empty">{emptyMessage}</div>;
  }

  return (
    <div className={`aes-table-wrapper ${className}`.trim()}>
      <table className="aes-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="aes-table-th">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              className={`aes-table-row ${onRowClick ? "aes-table-row-clickable" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className="aes-table-td">
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
