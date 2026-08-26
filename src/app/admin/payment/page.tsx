import { redirect } from "next/navigation";

export default function AdminPaymentRedirect() {
  redirect("/admin/payments");
}
