type PlannedCakeTask = {
  workDate: string;
  plannedMinutes: number;
  station: string;
};

const limaDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

/**
 * La comanda de cierre entra antes de la entrega con tiempo para las etapas
 * previstas ese día. La agenda de Producción conserva las etapas de días previos.
 */
export const kitchenReleaseAtForTasks = (
  scheduledAt: Date,
  branchPrepMinutes: number,
  tasks: PlannedCakeTask[],
): Date => {
  const deliveryDay = limaDate(scheduledAt);
  const sameDayMinutes = tasks
    .filter((task) => task.workDate === deliveryDay)
    .reduce((total, task) => total + Math.max(0, Number(task.plannedMinutes) || 0), 0);
  // El margen de sucursal queda como colchón configurable después del trabajo
  // específico de la torta, en lugar de añadir un número fijo oculto.
  const preparationMinutes = sameDayMinutes + Math.max(0, branchPrepMinutes);
  return new Date(scheduledAt.getTime() - Math.max(0, preparationMinutes) * 60_000);
};
