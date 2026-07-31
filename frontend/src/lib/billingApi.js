import axios from "axios";
import { withBackendAuth } from "./backendAuth";

const rawBackendUrl = process.env.REACT_APP_BACKEND_URL || "";
const normalizedBackendUrl =
  rawBackendUrl && !String(rawBackendUrl).includes("undefined")
    ? rawBackendUrl.replace(/\/$/, "")
    : "";
const isDev = process.env.NODE_ENV === "development";
const apiBase = normalizedBackendUrl ? `${normalizedBackendUrl}/api` : isDev ? "/api" : null;
const billingClient = apiBase
  ? axios.create({ baseURL: apiBase, timeout: 45000 })
  : null;

const FALLBACK_KEY_ID = process.env.REACT_APP_RAZORPAY_KEY_ID || "";

let checkoutScriptPromise = null;

function requireBillingClient() {
  if (!billingClient) {
    throw new Error("Payment service is not configured on this deployment.");
  }
  return billingClient;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load secure checkout.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load secure checkout."));
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}

/** POST /api/create-order — amount in paise (min 100). */
export async function createPaymentOrder({ amount, currency = "INR", receipt }) {
  const client = requireBillingClient();
  const { data } = await client.post("/create-order", { amount, currency, receipt });
  return data;
}

/** POST /api/verify-payment — Razorpay handler response fields. */
export async function verifyPayment(paymentResponse) {
  const client = requireBillingClient();
  const { data } = await client.post("/verify-payment", paymentResponse);
  return data;
}

/**
 * Open Razorpay Standard Checkout modal.
 * @param {object} order — { order_id, amount, currency, key_id?, name?, description? }
 * @param {object} options
 */
export async function openRazorpayCheckout(order, options = {}) {
  const {
    profile = {},
    verifyPath = "/verify-payment",
    authHeaders = null,
    onVerified = null,
  } = options;

  await loadRazorpayCheckout();
  const client = requireBillingClient();
  const key = order.key_id || FALLBACK_KEY_ID;
  if (!key) {
    throw new Error("Razorpay checkout key is not configured.");
  }

  return new Promise((resolve, reject) => {
    let completed = false;
    const checkout = new window.Razorpay({
      key,
      amount: order.amount,
      currency: order.currency || "INR",
      name: order.name || "BuildGuru",
      description: order.description || "Secure payment",
      order_id: order.order_id,
      prefill: {
        name: profile.name || "",
        email: profile.email || "",
        contact: profile.phone || "",
      },
      theme: { color: "#C85F2B" },
      handler: async (response) => {
        try {
          const requestConfig = authHeaders ? { headers: authHeaders } : undefined;
          const { data } = await client.post(verifyPath, response, requestConfig);
          completed = true;
          if (onVerified) {
            resolve(await onVerified(data, response));
          } else {
            resolve(data);
          }
        } catch (error) {
          completed = true;
          reject(error);
        }
      },
      modal: {
        ondismiss: () => {
          if (!completed) reject(new Error("Checkout was closed before payment completed."));
        },
      },
    });
    checkout.on("payment.failed", (response) => {
      completed = true;
      reject(new Error(response?.error?.description || "Payment failed. No plan was activated."));
    });
    checkout.open();
  });
}

export async function fetchBillingSummary() {
  const client = requireBillingClient();
  const { data } = await client.get("/billing/me", await withBackendAuth());
  return data;
}

export async function purchasePlan(planId, profile = {}) {
  const client = requireBillingClient();
  const { data: order } = await client.post(
    "/billing/order",
    { plan_id: planId },
    await withBackendAuth(),
  );
  const auth = await withBackendAuth();
  return openRazorpayCheckout(
    {
      ...order,
      order_id: order.order_id,
      name: order.name || "BuildGuru",
      description: order.description,
    },
    {
      profile,
      verifyPath: "/billing/verify",
      authHeaders: auth.headers,
    },
  );
}

export function billingErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  return detail || error?.message || "Payment could not be completed. Please try again.";
}
