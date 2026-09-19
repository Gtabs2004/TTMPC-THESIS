// Turns a FastAPI error body into a string that is safe to show in the UI.
//
// `detail` is not always a string: a 422 arrives as a list of
// {loc, msg, type} objects and some endpoints return an object. Passing those
// straight to `new Error(detail)` rendered "[object Object]".
export function apiErrorMessage(payload, fallback = "Something went wrong. Please try again.") {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        // Pydantic prefixes validator errors with "Value error, ".
        const msg = String(item?.msg || "").replace(/^Value error,\s*/i, "");
        if (!msg) return "";
        // loc is like ["body", "bonus", "member_category"]; the last part is the field.
        const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : "";
        return field && typeof field === "string" && item?.type === "missing"
          ? `${field.replace(/_/g, " ")}: ${msg.toLowerCase()}`
          : msg;
      })
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  if (detail && typeof detail === "object" && typeof detail.message === "string" && detail.message.trim()) {
    return detail.message;
  }

  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;

  return fallback;
}
