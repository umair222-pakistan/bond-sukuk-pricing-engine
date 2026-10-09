import { useAuth } from "../context/AuthContext";

const ADMIN_EMAILS = [
  "pakistanumair123@gmail.com",
  "pakistanumair123@noorfinance.pk",
];

export function useAdmin() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase().trim() ?? "";
  const isAdmin = ADMIN_EMAILS.includes(email);

  return { isAdmin, adminEmail: email, isOwner: isAdmin };
}
