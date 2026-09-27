import { OrderStatus, UserRole } from '@prisma/client';

/** The normal life of an order, in order. CANCELLED sits outside it. */
export const ORDER_FLOW: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
];

/** An order can only be cancelled before it has been handed to delivery. */
const CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];

/**
 * Statuses `role` may move an order to from `current`.
 * - Vendor: one step forward at a time, or cancel while still cancellable.
 * - Admin: any step forward (to fix a stuck order), or cancel while cancellable.
 * Delivered and cancelled orders are final for everyone.
 */
export function allowedNextStatuses(current: OrderStatus, role: UserRole): OrderStatus[] {
  const idx = ORDER_FLOW.indexOf(current);
  if (idx === -1 || current === OrderStatus.DELIVERED) return [];

  const forward =
    role === UserRole.ADMIN ? ORDER_FLOW.slice(idx + 1) : ORDER_FLOW.slice(idx + 1, idx + 2);
  const cancel = CANCELLABLE.includes(current) ? [OrderStatus.CANCELLED] : [];
  return [...forward, ...cancel];
}

/** Human wording, shared by notifications and timeline notes. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  ON_THE_WAY: 'On the Way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
