import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../store/supabase.service';

export type IngredientCategory =
  | 'Proteins'
  | 'Produce'
  | 'Dry Goods'
  | 'Condiments & Seasonings'
  | 'Dairy & Eggs'
  | 'Packaging';

export type StockStatus = 'Good' | 'Low' | 'Critical';

export interface Supplier {
  id: string;
  name: string;
}

export type VarianceReason =
  | 'spoilage'
  | 'shrinkage'
  | 'portion_drift'
  | 'theft'
  | 'damaged'
  | 'unaccounted';

export interface VarianceRecord {
  id: string;
  ingredientId: string;
  poId?: string;
  date: Date;
  theoreticalQty: number;
  actualQty: number;
  variance: number;
  variancePct: number;
  tolerancePct: number;
  reason?: VarianceReason;
  flagged: boolean;
}

/** Result of one delivery count check (shown after receiving a PO). */
export interface VarianceResult {
  lineIndex: number;
  ingredientId: string;
  theoreticalQty: number;
  physicalCount: number;
  variance: number;
  variancePct: number;
  tolerancePct: number;
  flagged: boolean;
}

/** What the staff enter for each PO line when receiving. */
export interface ReceiveEntry {
  qty: number;
  physicalCount: number | null;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  uom: string;
  unitCost: number;
  supplierId: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQty: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  qtyPerServing: number;
}

export interface RecipeMapping {
  menuItemId: string;
  menuItemName: string;
  ingredients: RecipeIngredient[];
}

export type POStatus = 'Draft' | 'Sent' | 'Partial' | 'Received';

export interface POLineItem {
  ingredientId: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  createdAt: Date;
  expectedAt: Date;
  receivedAt?: Date;
  status: POStatus;
  lineItems: POLineItem[];
  total: number;
  notes?: string;
}

export const DEFAULT_TOLERANCES: Record<string, number> = {
  'Proteins': 3,
  'Produce': 8,
  'Dry Goods': 2,
  'Condiments & Seasonings': 5,
  'Dairy & Eggs': 5,
  'Packaging': 3,
};

/* ---------- DB row <-> app model mappers ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
const toIngredient = (r: any): Ingredient => ({
  id: r.id,
  name: r.name,
  category: r.category,
  uom: r.uom,
  unitCost: Number(r.unit_cost),
  supplierId: r.supplier_id,
  currentStock: Number(r.current_stock),
  safetyStock: Number(r.safety_stock),
  reorderPoint: Number(r.reorder_point),
  reorderQty: Number(r.reorder_qty),
});

const fromIngredient = (i: Ingredient) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  uom: i.uom,
  unit_cost: i.unitCost,
  supplier_id: i.supplierId,
  current_stock: i.currentStock,
  safety_stock: i.safetyStock,
  reorder_point: i.reorderPoint,
  reorder_qty: i.reorderQty,
});

const toMenuItem = (r: any): MenuItem => ({
  id: r.id,
  name: r.name,
  price: Number(r.price),
  category: r.category,
  emoji: r.emoji,
});

const toRecipe = (r: any): RecipeMapping => ({
  menuItemId: r.menu_item_id,
  menuItemName: r.menu_item_name,
  ingredients: r.ingredients ?? [],
});

const toVariance = (r: any): VarianceRecord => ({
  id: r.id,
  ingredientId: r.ingredient_id,
  poId: r.po_id ?? undefined,
  date: new Date(r.date),
  theoreticalQty: Number(r.theoretical_qty),
  actualQty: Number(r.actual_qty),
  variance: Number(r.variance),
  variancePct: Number(r.variance_pct ?? 0),
  tolerancePct: Number(r.tolerance_pct ?? 0),
  reason: r.reason ?? undefined,
  flagged: !!r.flagged,
});

const fromVariance = (v: VarianceRecord) => ({
  id: v.id,
  ingredient_id: v.ingredientId,
  po_id: v.poId ?? null,
  date: v.date.toISOString(),
  theoretical_qty: v.theoreticalQty,
  actual_qty: v.actualQty,
  variance: v.variance,
  variance_pct: v.variancePct,
  tolerance_pct: v.tolerancePct,
  reason: v.reason ?? null,
  flagged: v.flagged,
});

const toPO = (r: any): PurchaseOrder => ({
  id: r.id,
  supplierId: r.supplier_id,
  createdAt: new Date(r.created_at),
  expectedAt: new Date(r.expected_at),
  receivedAt: r.received_at ? new Date(r.received_at) : undefined,
  status: r.status,
  lineItems: r.line_items ?? [],
  total: Number(r.total),
  notes: r.notes ?? undefined,
});

/** Next id like "ING-17" / "PO-0003" from the highest existing number. */
function nextId(prefix: string, existing: string[], pad: number): string {
  const max = existing.reduce((m, id) => {
    const n = parseInt(id.replace(/\D+/g, ''), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private db = inject(SupabaseService).client;

  readonly loading = signal(true);
  readonly error = signal('');

  readonly suppliers: Supplier[] = [
    { id: 'SUP-01', name: 'Batangas Meats Co.' },
    { id: 'SUP-02', name: 'Ilocos Fisheries' },
    { id: 'SUP-03', name: 'Tarlac Farms' },
    { id: 'SUP-04', name: 'Manila Dry Goods' },
    { id: 'SUP-05', name: 'Aling Packaging' },
  ];

  readonly ingredients = signal<Ingredient[]>([]);
  readonly menuItems = signal<MenuItem[]>([]);
  readonly recipeMappings = signal<RecipeMapping[]>([]);
  readonly varianceRecords = signal<VarianceRecord[]>([]);
  readonly purchaseOrders = signal<PurchaseOrder[]>([]);
  readonly tolerances = signal<Record<string, number>>({ ...DEFAULT_TOLERANCES });

  constructor() {
    this.loadAll();
  }

  /* ---------- Load ---------- */
  async loadAll() {
    this.loading.set(true);
    this.error.set('');

    const [ing, menu, rec, vr, po, tol] = await Promise.all([
      this.db.from('ingredients').select('*').order('id'),
      this.db.from('menu_items').select('*').order('id'),
      this.db.from('recipe_mappings').select('*'),
      this.db.from('variance_records').select('*').order('date', { ascending: false }),
      this.db.from('purchase_orders').select('*').order('created_at', { ascending: false }),
      this.db.from('category_tolerances').select('*'),
    ]);

    const err = ing.error ?? menu.error ?? rec.error ?? vr.error ?? po.error;
    if (err) {
      console.error('Supabase load failed:', err);
      this.error.set('Could not load data: ' + err.message);
      this.loading.set(false);
      return;
    }

    this.ingredients.set((ing.data ?? []).map(toIngredient));
    this.menuItems.set((menu.data ?? []).map(toMenuItem));
    this.recipeMappings.set((rec.data ?? []).map(toRecipe));
    this.varianceRecords.set((vr.data ?? []).map(toVariance));
    this.purchaseOrders.set((po.data ?? []).map(toPO));

    // tolerances: use defaults if the table is missing or empty
    if (!tol.error && tol.data?.length) {
      const map: Record<string, number> = { ...DEFAULT_TOLERANCES };
      for (const r of tol.data as any[]) map[r.category] = Number(r.tolerance_pct);
      this.tolerances.set(map);
    }
    this.loading.set(false);
  }

  /** Runs a DB write; on failure shows an error and re-syncs from the database. */
  private async run(
    what: string,
    op: PromiseLike<{ error: { message: string } | null }>
  ) {
    const { error } = await op;
    if (error) {
      console.error(what, error);
      this.error.set(`${what}: ${error.message}`);
      await this.loadAll();
    }
  }

  /* ---------- Helpers ---------- */
  stockStatus(ing: Ingredient): StockStatus {
    if (ing.currentStock <= ing.safetyStock) return 'Critical';
    if (ing.currentStock <= ing.reorderPoint) return 'Low';
    return 'Good';
  }

  toleranceFor(category: string): number {
    return this.tolerances()[category] ?? 5;
  }

  /* ---------- Ingredients (Module 16) ---------- */
  addIngredient(data: Omit<Ingredient, 'id'>): Ingredient {
    const created: Ingredient = {
      ...data,
      id: nextId('ING', this.ingredients().map((i) => i.id), 2),
    };
    this.ingredients.update((list) => [...list, created]);
    this.run('Add ingredient failed', this.db.from('ingredients').insert(fromIngredient(created)));
    return created;
  }

  updateIngredient(ing: Ingredient) {
    this.ingredients.update((list) => list.map((i) => (i.id === ing.id ? ing : i)));
    this.run(
      'Update ingredient failed',
      this.db.from('ingredients').update(fromIngredient(ing)).eq('id', ing.id)
    );
  }

  /* ---------- Recipes (Module 17) ---------- */
  saveRecipeMapping(mapping: RecipeMapping) {
    this.recipeMappings.update((list) => {
      const exists = list.some((r) => r.menuItemId === mapping.menuItemId);
      return exists
        ? list.map((r) => (r.menuItemId === mapping.menuItemId ? mapping : r))
        : [...list, mapping];
    });
    this.run(
      'Save recipe failed',
      this.db.from('recipe_mappings').upsert({
        menu_item_id: mapping.menuItemId,
        menu_item_name: mapping.menuItemName,
        ingredients: mapping.ingredients,
      })
    );
  }

  addMenuItem(item: Omit<MenuItem, 'id'>): MenuItem {
    const created: MenuItem = {
      ...item,
      id: nextId('M', this.menuItems().map((m) => m.id), 2),
    };
    this.menuItems.update((list) => [...list, created]);
    this.run('Add menu item failed', this.db.from('menu_items').insert(created));
    return created;
  }

  /**
   * Sales deduction hook: call this when an order is paid.
   * Subtracts each recipe's ingredients from stock (this is what makes the
   * "theoretical stock" move between deliveries).
   */
  deductStockForOrder(items: { menuItemId: string; qty: number }[]) {
    const use = new Map<string, number>();
    for (const it of items) {
      const recipe = this.recipeMappings().find((r) => r.menuItemId === it.menuItemId);
      if (!recipe) continue;
      for (const line of recipe.ingredients) {
        use.set(line.ingredientId, (use.get(line.ingredientId) ?? 0) + line.qtyPerServing * it.qty);
      }
    }
    if (!use.size) return;

    const changed: Ingredient[] = [];
    this.ingredients.update((list) =>
      list.map((ing) => {
        const q = use.get(ing.id);
        if (!q) return ing;
        const updated = { ...ing, currentStock: Math.max(0, +(ing.currentStock - q).toFixed(3)) };
        changed.push(updated);
        return updated;
      })
    );
    for (const ing of changed) {
      this.run(
        'Update stock failed',
        this.db.from('ingredients').update({ current_stock: ing.currentStock }).eq('id', ing.id)
      );
    }
  }

  /* ---------- Variance (Module 19) ---------- */
  setTolerance(category: string, pct: number) {
    const v = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
    this.tolerances.update((t) => ({ ...t, [category]: v }));
    this.run(
      'Save tolerance failed',
      this.db.from('category_tolerances').upsert({ category, tolerance_pct: v })
    );
  }

  updateVarianceReason(id: string, reason?: VarianceReason) {
    this.varianceRecords.update((list) => list.map((v) => (v.id === id ? { ...v, reason } : v)));
    this.run(
      'Update cause failed',
      this.db.from('variance_records').update({ reason: reason ?? null }).eq('id', id)
    );
  }

  /* ---------- Purchase orders (Module 20) ---------- */
  createPO(
    supplierId: string,
    lineItems: POLineItem[],
    expectedAt: Date,
    notes?: string
  ): PurchaseOrder {
    const po: PurchaseOrder = {
      id: nextId('PO', this.purchaseOrders().map((p) => p.id), 4),
      supplierId,
      createdAt: new Date(),
      expectedAt,
      status: 'Sent',
      lineItems: lineItems.map((l) => ({ ...l, receivedQty: 0 })),
      total: lineItems.reduce((s, l) => s + l.orderedQty * l.unitCost, 0),
      notes,
    };
    this.purchaseOrders.update((list) => [po, ...list]);
    this.run(
      'Create PO failed',
      this.db.from('purchase_orders').insert({
        id: po.id,
        supplier_id: po.supplierId,
        created_at: po.createdAt.toISOString(),
        expected_at: po.expectedAt.toISOString(),
        status: po.status,
        line_items: po.lineItems,
        total: po.total,
        notes: po.notes ?? null,
      })
    );
    return po;
  }

  /**
   * Receive a delivery. entries[i] belongs to po.lineItems[i].
   * If a physical (pre-delivery) count is given, the variance check runs:
   *   variance = physical - theoretical, flagged when |variance %| > category tolerance.
   * Stock is then set to (physical count if counted, otherwise theoretical) + received qty.
   */
  receivePO(poId: string, entries: ReceiveEntry[]): VarianceResult[] {
    const po = this.purchaseOrders().find((p) => p.id === poId);
    if (!po) return [];

    // 1. update the purchase order
    const lineItems = po.lineItems.map((l, i) => ({
      ...l,
      receivedQty: l.receivedQty + Math.max(0, entries[i]?.qty ?? 0),
    }));
    const complete = lineItems.every((l) => l.receivedQty >= l.orderedQty);
    const status: POStatus = complete ? 'Received' : 'Partial';
    const receivedAt = complete ? new Date() : po.receivedAt;

    this.purchaseOrders.update((list) =>
      list.map((p) => (p.id === poId ? { ...p, lineItems, status, receivedAt } : p))
    );
    this.run(
      'Update PO failed',
      this.db
        .from('purchase_orders')
        .update({
          line_items: lineItems,
          status,
          received_at: receivedAt ? receivedAt.toISOString() : null,
        })
        .eq('id', poId)
    );

    // 2. variance checks + new stock levels
    const stock = new Map(this.ingredients().map((i) => [i.id, i.currentStock]));
    const touched = new Set<string>();
    const results: VarianceResult[] = [];
    const records: VarianceRecord[] = [];
    const usedIds = this.varianceRecords().map((v) => v.id);

    po.lineItems.forEach((line, i) => {
      const ing = this.ingredients().find((x) => x.id === line.ingredientId);
      if (!ing) return;

      const received = Math.max(0, entries[i]?.qty ?? 0);
      const physical = entries[i]?.physicalCount;
      const theoretical = stock.get(ing.id) ?? 0;
      let base = theoretical;

      if (physical !== null && physical !== undefined && Number.isFinite(physical) && physical >= 0) {
        const variance = +(physical - theoretical).toFixed(3);
        const variancePct =
          theoretical > 0 ? (Math.abs(variance) / theoretical) * 100 : variance !== 0 ? 100 : 0;
        const tolerancePct = this.toleranceFor(ing.category);
        const flagged = variancePct > tolerancePct;

        const id = nextId('VAR', usedIds, 3);
        usedIds.push(id);
        records.push({
          id,
          ingredientId: ing.id,
          poId,
          date: new Date(),
          theoreticalQty: theoretical,
          actualQty: physical,
          variance,
          variancePct,
          tolerancePct,
          flagged,
        });
        results.push({
          lineIndex: i,
          ingredientId: ing.id,
          theoreticalQty: theoretical,
          physicalCount: physical,
          variance,
          variancePct,
          tolerancePct,
          flagged,
        });
        base = physical; // the count becomes the new baseline
        touched.add(ing.id);
      }

      if (received > 0) touched.add(ing.id);
      stock.set(ing.id, +(base + received).toFixed(3));
    });

    // 3. save stock levels
    const changed: Ingredient[] = [];
    this.ingredients.update((list) =>
      list.map((ing) => {
        if (!touched.has(ing.id)) return ing;
        const updated = { ...ing, currentStock: stock.get(ing.id) ?? ing.currentStock };
        changed.push(updated);
        return updated;
      })
    );
    for (const ing of changed) {
      this.run(
        'Update stock failed',
        this.db.from('ingredients').update({ current_stock: ing.currentStock }).eq('id', ing.id)
      );
    }

    // 4. save variance records
    if (records.length) {
      this.varianceRecords.update((list) => [...records.reverse(), ...list]);
      this.run(
        'Save variance records failed',
        this.db.from('variance_records').insert(records.map(fromVariance))
      );
    }

    return results;
  }
}