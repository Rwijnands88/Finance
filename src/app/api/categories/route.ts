import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateCategoryBody = {
  householdId?: string;
  name?: string;
};

type UpdateCategoryBody = CreateCategoryBody & {
  categoryId?: string;
};

type DeleteCategoryBody = {
  householdId?: string;
  categoryId?: string;
};

const categoryColors = [
  "#6366F1",
  "#22C55E",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#A855F7",
  "#F97316",
  "#14B8A6",
];

export async function POST(request: Request) {
  const body = (await request.json()) as CreateCategoryBody;
  const name = body.name?.trim().replace(/\s+/g, " ") ?? "";

  if (!body.householdId || name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "Vul een categorienaam van 2 tot 40 tekens in." },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("household_id", body.householdId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: membershipError?.message ?? "Huishouden ontbreekt." },
      { status: 403 },
    );
  }

  const { data: existingCategory, error: existingError } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", body.householdId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  if (existingCategory) {
    return NextResponse.json(
      { error: "Deze categorie bestaat al." },
      { status: 409 },
    );
  }

  const { data: lastCategory, error: lastCategoryError } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("household_id", body.householdId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCategoryError) {
    return NextResponse.json(
      { error: lastCategoryError.message },
      { status: 400 },
    );
  }

  const sortOrder = Math.max(200, (lastCategory?.sort_order ?? 190) + 10);
  const color =
    categoryColors[Math.abs(hashString(name)) % categoryColors.length] ??
    categoryColors[0];
  const { data: category, error: insertError } = await supabase
    .from("categories")
    .insert({
      household_id: body.householdId,
      name,
      kind: "variable",
      color,
      sort_order: sortOrder,
    })
    .select("id, name, kind, color, sort_order")
    .single();

  if (insertError) {
    return NextResponse.json(
      {
        error:
          insertError.code === "23505"
            ? "Deze categorie bestaat al."
            : insertError.message,
      },
      { status: insertError.code === "23505" ? 409 : 400 },
    );
  }

  return NextResponse.json({
    category: {
      id: category.id,
      name: category.name,
      kind: category.kind,
      color: category.color,
      sortOrder: category.sort_order,
      averageMonthly: 0,
    },
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateCategoryBody;
  const name = body.name?.trim().replace(/\s+/g, " ") ?? "";

  if (!body.householdId || !body.categoryId || name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "Vul een categorienaam van 2 tot 40 tekens in." },
      { status: 400 },
    );
  }

  const validation = await validateCategoryAccess(body.householdId, body.categoryId);

  if (validation instanceof NextResponse) {
    return validation;
  }

  if (!isCustomVariableCategory(validation.category)) {
    return NextResponse.json(
      { error: "Standaardcategorieen kun je niet hernoemen." },
      { status: 400 },
    );
  }

  const { supabase } = validation;
  const { data: category, error } = await supabase
    .from("categories")
    .update({ name })
    .eq("id", body.categoryId)
    .eq("household_id", body.householdId)
    .select("id, name, kind, color, sort_order")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505" ? "Deze categorie bestaat al." : error.message,
      },
      { status: error.code === "23505" ? 409 : 400 },
    );
  }

  return NextResponse.json({
    category: {
      id: category.id,
      name: category.name,
      kind: category.kind,
      color: category.color,
      sortOrder: category.sort_order,
      averageMonthly: 0,
    },
  });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as DeleteCategoryBody;

  if (!body.householdId || !body.categoryId) {
    return NextResponse.json(
      { error: "Categorie ontbreekt." },
      { status: 400 },
    );
  }

  const validation = await validateCategoryAccess(body.householdId, body.categoryId);

  if (validation instanceof NextResponse) {
    return validation;
  }

  if (!isCustomVariableCategory(validation.category)) {
    return NextResponse.json(
      { error: "Standaardcategorieen kun je niet verwijderen." },
      { status: 400 },
    );
  }

  const { supabase } = validation;
  const { count, error: transactionError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", body.householdId)
    .eq("category_id", body.categoryId);

  if (transactionError) {
    return NextResponse.json(
      { error: transactionError.message },
      { status: 400 },
    );
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Deze categorie is gekoppeld aan ${count} uitgaven en kan daarom niet worden verwijderd.`,
        transactionCount: count,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", body.categoryId)
    .eq("household_id", body.householdId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

function hashString(value: string) {
  return Array.from(value).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) | 0,
    0,
  );
}

async function validateCategoryAccess(householdId: string, categoryId: string) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: membershipError?.message ?? "Huishouden ontbreekt." },
      { status: 403 },
    );
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, household_id, name, kind, color, sort_order")
    .eq("id", categoryId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (categoryError || !category) {
    return NextResponse.json(
      { error: categoryError?.message ?? "Categorie niet gevonden." },
      { status: 404 },
    );
  }

  return { supabase, category };
}

function isCustomVariableCategory(category: { kind: string; sort_order: number }) {
  return category.kind === "variable" && category.sort_order >= 200;
}
