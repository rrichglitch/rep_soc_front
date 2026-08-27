// After returning from Stripe Checkout, the browser history contains the
// checkout.stripe.com entry. The in-app back button must never walk back into
// it. Called on the checkout-return landing page's mount: jump back over the
// Stripe entry, then replace that position with the current page — the back
// flow then continues to the page that existed before the checkout started.
export function repairCheckoutHistory(navigate: (to: any, opts?: any) => void): boolean {
  const params = new URLSearchParams(window.location.search);
  const fromCheckout =
    params.get('pro_claim') === 'success' ||
    params.get('org_claim') === 'success' ||
    !!params.get('session_id');
  if (!fromCheckout) return false;
  navigate(-2);
  navigate(window.location.pathname + window.location.search, { replace: true });
  return true;
}