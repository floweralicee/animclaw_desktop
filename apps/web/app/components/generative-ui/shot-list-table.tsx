"use client";

import { useState, useCallback } from "react";
import type { GenUIComponentProps, ShotListTableArgs, GenUIShotListRow } from "@/lib/generative-ui-registry";

export function ShotListTable({
	toolCallId,
	status,
	args,
	result,
	respond,
}: GenUIComponentProps<ShotListTableArgs>) {
	const [rows, setRows] = useState<GenUIShotListRow[]>(args.rows ?? []);
	const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
	const [confirmed, setConfirmed] = useState(status === "done" || !!result);

	const isDone = confirmed || status === "done";

	const columns: { key: keyof GenUIShotListRow; label: string; width?: string }[] = [
		{ key: "shotNumber", label: "Shot #", width: "60px" },
		{ key: "sceneNumber", label: "Scene #", width: "60px" },
		{ key: "shotType", label: "Type", width: "100px" },
		{ key: "description", label: "Description" },
		{ key: "notes", label: "Notes" },
		{ key: "characters", label: "Characters", width: "100px" },
	];

	const handleCellEdit = useCallback((rowIndex: number, col: keyof GenUIShotListRow, value: string) => {
		setRows((prev) => {
			const next = [...prev];
			next[rowIndex] = { ...next[rowIndex], [col]: value };
			return next;
		});
	}, []);

	const handleConfirm = useCallback(() => {
		if (isDone) return;
		setConfirmed(true);
		respond({ action: "confirm", rows });
	}, [isDone, rows, respond]);

	return (
		<div
			className="rounded-2xl overflow-hidden"
			style={{
				background: "var(--color-surface)",
				border: "1px solid var(--color-border)",
			}}
		>
			{/* Header */}
			<div
				className="px-4 py-2.5 flex items-center justify-between"
				style={{
					borderBottom: "1px solid var(--color-border)",
					background: "var(--color-surface-hover)",
				}}
			>
				<div className="flex items-center gap-2">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" />
					</svg>
					<span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
						{args.title ?? "Shot List"}
					</span>
					<span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
						{rows.length} shots
					</span>
				</div>
				{!isDone && (
					<span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
						Click any cell to edit
					</span>
				)}
			</div>

			{/* Table */}
			<div className="overflow-x-auto">
				<table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
					<thead>
						<tr>
							{columns.map((col) => (
								<th
									key={col.key}
									className="px-2.5 py-2 text-left font-semibold whitespace-nowrap"
									style={{
										borderBottom: "1px solid var(--color-border)",
										color: "var(--color-text-muted)",
										width: col.width,
										background: "var(--color-surface-hover)",
									}}
								>
									{col.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, ri) => (
							<tr key={`${toolCallId}-row-${ri}`}>
								{columns.map((col) => {
									const isEditing = editingCell?.row === ri && editingCell?.col === col.key;
									const value = row[col.key] ?? "";
									return (
										<td
											key={col.key}
											className="px-2.5 py-1.5 align-top"
											style={{
												borderBottom: "1px solid var(--color-border)",
												color: "var(--color-text)",
												width: col.width,
												cursor: isDone ? "default" : "text",
											}}
											onClick={() => {
												if (!isDone) setEditingCell({ row: ri, col: col.key });
											}}
										>
											{isEditing ? (
												<input
													type="text"
													defaultValue={value}
													autoFocus
													className="w-full bg-transparent outline-none text-xs"
													style={{ color: "var(--color-text)" }}
													onBlur={(e) => {
														handleCellEdit(ri, col.key, e.target.value);
														setEditingCell(null);
													}}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === "Escape") {
															handleCellEdit(ri, col.key, (e.target as HTMLInputElement).value);
															setEditingCell(null);
														}
													}}
												/>
											) : (
												<span className="block min-h-[1.2em]">{value}</span>
											)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Actions */}
			{!isDone && (
				<div
					className="px-4 py-3 flex items-center justify-end"
					style={{ borderTop: "1px solid var(--color-border)" }}
				>
					<button
						type="button"
						onClick={handleConfirm}
						className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
						style={{
							background: "var(--color-accent)",
							color: "#fff",
							cursor: "pointer",
						}}
					>
						Confirm Shot List
					</button>
				</div>
			)}

			{isDone && (
				<div
					className="px-4 py-2.5 flex items-center gap-2"
					style={{
						borderTop: "1px solid var(--color-border)",
						background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))",
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span className="text-xs" style={{ color: "var(--color-accent)" }}>
						Shot list confirmed — {rows.length} shots
					</span>
				</div>
			)}
		</div>
	);
}
