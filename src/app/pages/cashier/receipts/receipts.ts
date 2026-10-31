import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CashierLayout } from '../../../components/cashier-layout/cashier-layout';
import { MiniCalendar } from '../../../components/mini-calendar/mini-calendar';
import { ReceiptView } from '../../../components/receipt-view/receipt-view';
import { CashierStore, type Transaction } from '../../../store/cashier-store';
import { NotificationStore } from '../../../store/notification-store'; // Added

@Component({
  selector: 'app-receipts',
  imports: [CashierLayout, MiniCalendar, ReceiptView, DatePipe],
  templateUrl: './receipts.html',
})
export class Receipts implements OnInit, OnDestroy {
  private store = inject(CashierStore);
  private notif = inject(NotificationStore); // Added
  
  private refreshInterval: any; // Added
  private previousTxnCount = 0; // Added

  search = signal('');
  selectedId = signal<string | null>(null);
  filterDate = signal<string | null>(null);

  allTxns = computed(() => this.store.transactions());
  
  activeDates = computed(() => {
    const dates = new Set<string>();
    this.allTxns().forEach(t => {
      dates.add(t.settledAt.toLocaleDateString('en-CA'));
    });
    return dates;
  });

  selected = computed(() => this.filtered().find(t => t.id === this.selectedId()) ?? null);
  hasFilters = computed(() => !!this.search() || !!this.filterDate());

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const d = this.filterDate();

    return this.allTxns().filter(t => {
      if (d && t.settledAt.toLocaleDateString('en-CA') !== d) return false;

      if (!q) return true;
      if (t.id.toLowerCase().includes(q)) return true;
      if (t.paymentMethod.toLowerCase().includes(q)) return true;
      if (t.orderType.toLowerCase().includes(q)) return true;
      if (t.items.some(i => i.name.toLowerCase().includes(q))) return true;

      return false;
    });
  });

  // ADDED: Polling logic
  ngOnInit() {
    this.previousTxnCount = this.allTxns().length;

    this.refreshInterval = setInterval(async () => {
      await this.store.loadTransactions();
      
      const currentCount = this.allTxns().length;

      // If a new receipt was added, show a notification
      if (currentCount > this.previousTxnCount) {
        this.notif.show('New payment received!', 'success');
      }
      
      this.previousTxnCount = currentCount;
    }, 1000); // Refresh every 5 seconds
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  onSearch(e: Event) {
    this.search.set((e.target as HTMLInputElement).value);
  }

  clearSearch() {
    this.search.set('');
  }

  onDateSelect(date: string | null) {
    this.filterDate.set(date);
  }

  handlePrint() {
    window.print();
  }
}