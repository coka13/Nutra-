export type BusinessPackage = {
  id: string;
  size: number;
  price: number;
  date: string;
  relationship: { client: { id: string; name: string }; status: string };
  sessions: { id: string; date: string; status: string; notes: string }[];
  receipts: { id: string; date: string; amount: number; method: string; notes: string }[];
};
export const remainingSessions = (p: Pick<BusinessPackage, 'size' | 'sessions'>) =>
  p.size - p.sessions.filter((s) => s.status === 'COMPLETED').length;

// Amounts are integer agorot. Debt is a snapshot at the end of the selected month.
export function monthlyBusiness(packages: BusinessPackage[], month: string) {
  const inMonth = (date: string) => date.slice(0, 7) === month;
  const rows = packages
    .filter((p) => p.date.slice(0, 7) <= month)
    .map((p) => {
      const receipts = p.receipts.filter((r) => inMonth(r.date));
      const sessions = p.sessions.filter((s) => inMonth(s.date));
      const paidToDate = p.receipts
        .filter((r) => r.date.slice(0, 7) <= month)
        .reduce((a, r) => a + r.amount, 0);
      return {
        id: p.id,
        client: p.relationship.client.name,
        size: p.size,
        sales: inMonth(p.date) ? p.price : 0,
        income: receipts.reduce((a, r) => a + r.amount, 0),
        debt: p.price - paidToDate,
        completed: sessions.filter((s) => s.status === 'COMPLETED').length,
        planned: sessions.filter((s) => s.status === 'PLANNED').length,
        cancelled: sessions.filter((s) => s.status === 'CANCELLED').length,
        remaining:
          p.size -
          p.sessions.filter((s) => s.status === 'COMPLETED' && s.date.slice(0, 7) <= month).length,
      };
    });
  return {
    rows,
    income: rows.reduce((a, r) => a + r.income, 0),
    sales: rows.reduce((a, r) => a + r.sales, 0),
    debt: rows.reduce((a, r) => a + r.debt, 0),
    completed: rows.reduce((a, r) => a + r.completed, 0),
    planned: rows.reduce((a, r) => a + r.planned, 0),
    cancelled: rows.reduce((a, r) => a + r.cancelled, 0),
    packagesSold: packages.filter((p) => inMonth(p.date)).length,
    activeClients: new Set(
      packages
        .filter((p) => p.sessions.some((s) => inMonth(s.date) && s.status === 'COMPLETED'))
        .map((p) => p.relationship.client.id),
    ).size,
  };
}
