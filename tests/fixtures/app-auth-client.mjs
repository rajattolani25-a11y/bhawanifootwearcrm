// Mocked by the browser audit only. Never imported by the application.
window.__sdkLoads++;
const query = {
  select() {
    return this;
  },
  eq() {
    return this;
  },
  async maybeSingle() {
    return { data: window.__role === "owner" ? { role: "owner" } : null, error: null };
  },
};
export const supabase = {
  auth: {
    async getSession() {
      window.__sessions++;
      return { data: { session: window.__session } };
    },
    onAuthStateChange(callback) {
      window.__listeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              window.__unsubscribed++;
              window.__listeners = window.__listeners.filter((item) => item !== callback);
            },
          },
        },
      };
    },
  },
  from() {
    return query;
  },
};
