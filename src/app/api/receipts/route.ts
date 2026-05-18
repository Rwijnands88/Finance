import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const transactionId = stringValue(formData.get("transactionId"));
  const accountId = stringValue(formData.get("accountId"));
  const image = formData.get("image");

  if (!transactionId || !(image instanceof File)) {
    return NextResponse.json(
      { error: "Bon of transactie ontbreekt." },
      { status: 400 },
    );
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "De bon moet een afbeelding zijn." },
      { status: 400 },
    );
  }

  if (image.size > 3 * 1024 * 1024) {
    return NextResponse.json(
      { error: "De bon is te groot om op te slaan." },
      { status: 400 },
    );
  }

  const userSupabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await userSupabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: transaction, error: transactionError } = await userSupabase
    .from("transactions")
    .select("id, household_id, account_id")
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionError || !transaction) {
    return NextResponse.json(
      { error: transactionError?.message ?? "Transactie niet gevonden." },
      { status: 404 },
    );
  }

  if (transaction.account_id && accountId && transaction.account_id !== accountId) {
    return NextResponse.json(
      { error: "Bon hoort niet bij deze rekening." },
      { status: 400 },
    );
  }

  const receiptAccountId = transaction.account_id ?? accountId;

  if (!receiptAccountId) {
    return NextResponse.json(
      { error: "Rekening ontbreekt voor deze bon." },
      { status: 400 },
    );
  }

  const receiptPath = `${receiptAccountId}/${transaction.id}.jpg`;
  const receiptBuffer = Buffer.from(await image.arrayBuffer());
  const writeSupabase = getSupabaseAdminClient() ?? userSupabase;

  const { error: uploadError } = await writeSupabase.storage
    .from("receipts")
    .upload(receiptPath, receiptBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 400 },
    );
  }

  const { error: updateError } = await writeSupabase
    .from("transactions")
    .update({ receipt_url: receiptPath })
    .eq("id", transaction.id)
    .eq("household_id", transaction.household_id);

  if (updateError) {
    await writeSupabase.storage.from("receipts").remove([receiptPath]);

    return NextResponse.json(
      { error: updateError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ receiptUrl: receiptPath });
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
