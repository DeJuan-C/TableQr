import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  InventoryService,
  Ingredient,
  IngredientCategory,
  StockStatus,
} from '../../../services/inventory.service';

@Component({
  selector: 'app-module16',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './ingredient-master.html',
  styleUrl: './ingredient-master.css',
})
export class Module16 {
  private inv = inject(InventoryService);

  readonly suppliers = this.inv.suppliers;

  readonly CATEGORIES: IngredientCategory[] = [
    'Proteins', 'Produce', 'Dry Goods',
    'Condiments & Seasonings', 'Dairy & Eggs', 'Packaging',
  ];
  readonly CAT_EMOJI: Record<IngredientCategory, string> = {
    'Proteins': '🥩',
    'Produce': '🥬',
    'Dry Goods': '🌾',
    'Condiments & Seasonings': '🧂',
    'Dairy & Eggs': '🥚',
    'Packaging': '📦',
  };
  readonly UOMS = ['kg', 'g', 'L', 'ml', 'pc', 'bundle', 'pack', 'tray', 'can'];

  search = '';
  filterCat = 'All';

  showForm = false;
  editId: string | null = null;
  form: Ingredient = this.emptyForm();

  private readonly STATUS_COLORS: Record<StockStatus, { bg: string; text: string; border: string }> = {
    Good: { bg: '#e2e6d3', text: '#3f6b3a', border: '#b9c7a5' },
    Low: { bg: '#f3e6c3', text: '#8a6414', border: '#dcc58a' },
    Critical: { bg: '#f4d9cf', text: '#b3332a', border: '#e3aa9a' },
  };

  get visible(): Ingredient[] {
    const q = this.search.trim().toLowerCase();
    return this.inv.ingredients().filter(
      (i) =>
        (this.filterCat === 'All' || i.category === this.filterCat) &&
        (!q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
    );
  }

  get countGood(): number { return this.countBy('Good'); }
  get countLow(): number { return this.countBy('Low'); }
  get countCritical(): number { return this.countBy('Critical'); }

  private countBy(s: StockStatus): number {
    return this.inv.ingredients().filter((i) => this.inv.stockStatus(i) === s).length;
  }

  stockStatus(ing: Ingredient): StockStatus {
    return this.inv.stockStatus(ing);
  }

  statusColor(s: StockStatus | string) {
    return this.STATUS_COLORS[s as StockStatus];
  }

  getSupplierName(id: string): string {
    return this.suppliers.find((s) => s.id === id)?.name.split(' ')[0] ?? '—';
  }

  openNew() {
    this.editId = null;
    this.form = this.emptyForm();
    this.showForm = true;
  }

  openEdit(ing: Ingredient) {
    this.editId = ing.id;
    this.form = { ...ing };
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
  }

  handleSave() {
    if (!this.form.name.trim()) return;

    if (this.editId) {
      this.inv.updateIngredient({ ...this.form, id: this.editId });
    } else {
      const { id, ...data } = this.form;
      this.inv.addIngredient(data);
    }
    this.closeForm();
  }

  private emptyForm(): Ingredient {
    return {
      id: '',
      name: '',
      category: 'Proteins',
      uom: 'kg',
      unitCost: 0,
      supplierId: this.inv.suppliers[0].id,
      currentStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQty: 0,
    };
  }
}