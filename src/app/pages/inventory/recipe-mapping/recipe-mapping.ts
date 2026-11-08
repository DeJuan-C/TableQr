import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryService, RecipeIngredient } from '../../../services/inventory.service';

@Component({
  selector: 'app-recipe-mapping',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './recipe-mapping.html',
  styleUrl: './recipe-mapping.css',
})

export class RecipeMapping {
  private inv = inject(InventoryService);

  
  readonly ingredients = this.inv.ingredients;
  readonly menuItems = this.inv.menuItems;
  readonly recipeMappings = this.inv.recipeMappings;

  readonly selectedMenuId = signal<string>('');;
  readonly editLines = signal<RecipeIngredient[] | null>(null);
  readonly editing = signal(false);

  readonly selectedItem = computed(
    () => this.menuItems().find((m) => m.id === this.selectedMenuId()) ?? this.menuItems()[0]
  );

 readonly existingMapping = computed(() =>
    this.recipeMappings().find((r) => r.menuItemId === this.selectedItem()?.id)
  );

  readonly lines = computed<RecipeIngredient[]>(
    () => this.editLines() ?? this.existingMapping()?.ingredients ?? []
  );

  readonly costPerServing = computed(() =>
    this.lines().reduce((sum, l) => {
      const ing = this.getIng(l.ingredientId);
      return ing ? sum + ing.unitCost * l.qtyPerServing : sum;
    }, 0)
  );

  readonly foodCostPct = computed(() => {
    const price = this.selectedItem()?.price ?? 0;
    return price > 0 ? (this.costPerServing() / price) * 100 : 0;
  });

  // ---------- Add Food form ----------
  readonly FOOD_CATEGORIES = [
    'Pork', 'Beef', 'Chicken', 'Fish', 'Soup', 'Stew',
    'Vegetables', 'Rice', 'Dessert', 'Drinks',
  ];

  readonly showAdd = signal(false);
  readonly newName = signal('');
  readonly newPrice = signal<number | null>(null);
  readonly newCategory = signal('Pork');
  readonly newEmoji = signal('🍽️');
  readonly addError = signal('');

    // ---------- Search & filter (menu item list) ----------
  readonly STATUS_FILTERS = ['All', 'Mapped', 'No recipe'] as const;

  readonly search = signal('');
  readonly filterCat = signal('All');
  readonly filterStatus = signal<'All' | 'Mapped' | 'No recipe'>('All');

  /** Category options come from the menu itself, so new foods appear automatically. */
  readonly categories = computed(() =>
    [...new Set(this.menuItems().map((m) => m.category))].sort()
  );

  readonly filteredItems = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.filterCat();
    const st = this.filterStatus();

    return this.menuItems().filter((m) => {
      if (cat !== 'All' && m.category !== cat) return false;
      if (st !== 'All' && (st === 'Mapped') !== this.hasMapped(m.id)) return false;
      if (q && !m.name.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.filterCat() !== 'All' || this.filterStatus() !== 'All'
  );

  countFor(f: 'All' | 'Mapped' | 'No recipe'): number {
    const all = this.menuItems();
    if (f === 'All') return all.length;
    const mapped = all.filter((m) => this.hasMapped(m.id)).length;
    return f === 'Mapped' ? mapped : all.length - mapped;
  }

  clearFilters() {
    this.search.set('');
    this.filterCat.set('All');
    this.filterStatus.set('All');
  }

  getIng(id: string) {
    return this.ingredients().find((i) => i.id === id);
  }

  hasMapped(menuId: string): boolean {
    return this.recipeMappings().some((r) => r.menuItemId === menuId);
  }

  selectItem(id: string) {
    this.selectedMenuId.set(id);
    this.editing.set(false);
    this.editLines.set(null);
  }

  openAdd() {
    this.newName.set('');
    this.newPrice.set(null);
    this.newCategory.set('Pork');
    this.newEmoji.set('🍽️');
    this.addError.set('');
    this.showAdd.set(true);
  }

  closeAdd() {
    this.showAdd.set(false);
  }

  handleAddFood() {
    const name = this.newName().trim();
    const price = Number(this.newPrice());

    if (!name) {
      this.addError.set('Please enter a food name.');
      return;
    }
    if (!price || price <= 0) {
      this.addError.set('Please enter a price greater than 0.');
      return;
    }
    if (this.menuItems().some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      this.addError.set('A menu item with this name already exists.');
      return;
    }

    const created = this.inv.addMenuItem({
      name,
      price,
      category: this.newCategory(),
      emoji: this.newEmoji().trim() || '🍽️',
    });

    this.closeAdd();
    this.clearFilters();    
    this.selectItem(created.id);
    this.startEdit(); // jump straight into building the recipe

    // scroll the new item into view inside the list
    setTimeout(() => {
      document.getElementById('menu-' + created.id)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---------- Recipe editing ----------
  startEdit() {
    const current = this.existingMapping()?.ingredients ?? [];
    this.editLines.set(current.map((l) => ({ ...l })));
    this.editing.set(true);
  }

  addLine() {
    this.editLines.update((prev) => [
      ...(prev ?? []),
      { ingredientId: this.ingredients()[0]?.id ?? '', qtyPerServing: 0 },
    ]);
  }

  removeLine(idx: number) {
    this.editLines.update((prev) => (prev ?? []).filter((_, i) => i !== idx));
  }

  updateLine(idx: number, field: keyof RecipeIngredient, val: string | number) {
    this.editLines.update((prev) =>
      (prev ?? []).map((l, i) =>
        i === idx
          ? { ...l, [field]: field === 'qtyPerServing' ? Number(val) : val }
          : l
      )
    );
  }

  handleSave() {
    const item = this.selectedItem();
    const lines = this.editLines();
    if (!item || lines === null) return;

    this.inv.saveRecipeMapping({
      menuItemId: item.id,
      menuItemName: item.name,
      ingredients: lines.filter((l) => l.ingredientId && l.qtyPerServing > 0),
    });
    this.cancel();
  }

  cancel() {
    this.editing.set(false);
    this.editLines.set(null);
  }
}