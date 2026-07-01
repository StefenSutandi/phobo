const midtransClient = require("midtrans-client");

export function getSnapClient() {
  return new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY || "",
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "",
  });
}

export async function createSnapTransaction({
  orderId,
  grossAmount,
  sessionId,
}: {
  orderId: string;
  grossAmount: number;
  sessionId: string;
}) {
  const snap = getSnapClient();
  const params = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    customer_details: {
      first_name: "Phobo",
      last_name: "Customer",
    },
    custom_field1: sessionId,
  };

  const transaction = await snap.createTransaction(params);
  return {
    token: transaction.token,
    redirectUrl: transaction.redirect_url,
  };
}
