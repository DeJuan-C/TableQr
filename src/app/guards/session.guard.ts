import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from '../services/supabase';
import { OrderService } from '../services/order.service';

const DEVICE_KEY = 'orderqr_device_id';
let memoryDeviceId = '';

// Random ID na naka-save sa browser ng cellphone (hindi nagbabago kahit magpalit ng IP)
function deviceId(): string {
  const make = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = make();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // private mode / blocked storage
    return (memoryDeviceId ||= make());
  }
}

export const sessionGuard: CanActivateFn = async route => {
  const router = inject(Router);

  const tableId = route.paramMap.get('tableId') ?? '';
  const key = OrderService.tokenKey(tableId); // orderqr_token_T01
  const sessKey = `orderqr_session_${tableId}`; // session id na hawak ng tab na ito
  const tableNum = OrderService.tableNumber(tableId);

  const bad = (reason: string) =>
    router.createUrlTree(['/invalid-session'], { queryParams: { reason } });

  const urlToken = route.queryParamMap.get('token'); // may laman = bagong scan
  const token = urlToken ?? sessionStorage.getItem(key) ?? '';

  if (!tableId || !tableNum || !token) {
    return bad('missing');
  }

  try {
    const dev = deviceId();

    // Scan (token sa URL): buksan o salihan ang session.
    // Resume (galing sa sessionStorage): i-check lang kung kasalukuyan pa rin.
    const { data, error } = urlToken
      ? await supabase.rpc('open_session', {
          p_table_id: tableNum,
          p_token: urlToken,
          p_device_id: dev,
          p_base_url: window.location.origin,
        })
      : await supabase.rpc('resume_session', {
          p_table_id: tableNum,
          p_token: token,
          p_device_id: dev,
          p_session_id: Number(sessionStorage.getItem(sessKey)) || null,
        });

    if (error) {
      // Hindi pa na-install ang bagong SQL? Bumalik sa dating validation.
      if (error.code === 'PGRST202') {
        const legacy = await supabase.rpc('validate_session', {
          p_table_id: tableNum,
          p_token: token,
        });
        if (!legacy.error && legacy.data?.valid) {
          sessionStorage.setItem(key, token);
          return true;
        }
        return bad(legacy.data?.reason ?? 'error');
      }
      return bad('error');
    }

    if (data?.valid) {
      sessionStorage.setItem(key, token);
      if (data.sessionId != null) sessionStorage.setItem(sessKey, String(data.sessionId));
      return true;
    }

    sessionStorage.removeItem(key);
    sessionStorage.removeItem(sessKey);
    return bad(data?.reason ?? 'invalid');
  } catch {
    return bad('error');
  }
};