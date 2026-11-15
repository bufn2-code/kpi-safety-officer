import { NextResponse } from "next/server";
import {
  firestoreDeleteDoc,
  firestoreGetDoc,
  firestoreListCollection,
  firestoreSetDoc,
  type FirestoreValue,
} from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { parseKpiParameterDoc, type KpiParameter } from "../route";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const doc = await firestoreGetDoc("kpi_parameters", id);
    if (!doc) {
      return NextResponse.json(
        { berhasil: false, pesan: "Parameter KPI tidak ditemukan." },
        { status: 404 }
      );
    }

    const currentParam = parseKpiParameterDoc(doc);
    const body = await request.json();

    const nextActive =
      typeof body.isActive === "boolean" ? body.isActive : currentParam.isActive;
    const nextWeight =
      body.weight !== undefined && !Number.isNaN(Number(body.weight))
        ? Number(body.weight)
        : currentParam.weight;

    // Validasi total bobot aktif maksimal 100%
    if (nextActive) {
      const docs = await firestoreListCollection("kpi_parameters");
      const allParams = docs.map(parseKpiParameterDoc);
      const otherActiveWeight = allParams
        .filter((p: KpiParameter) => p.id !== id && p.isActive)
        .reduce((acc: number, p: KpiParameter) => acc + p.weight, 0);

      if (Math.round((otherActiveWeight + nextWeight) * 100) / 100 > 100) {
        return NextResponse.json(
          {
            berhasil: false,
            pesan: `Total bobot aktif akan menjadi ${otherActiveWeight + nextWeight}% (maksimal 100%). Sesuaikan bobot parameter lain terlebih dahulu.`,
          },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, FirestoreValue> = {};

    if (typeof body.code === "string" && body.code.trim()) {
      updates.code = { stringValue: body.code.trim().toUpperCase() };
    }
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = { stringValue: body.name.trim() };
    }
    if (typeof body.description === "string") {
      updates.description = { stringValue: body.description.trim() };
    }
    if (typeof body.unit === "string" && body.unit.trim()) {
      updates.unit = { stringValue: body.unit.trim() };
    }
    if (body.target !== undefined && Number(body.target) > 0) {
      updates.target = { doubleValue: Number(body.target) };
    }
    if (body.weight !== undefined && Number(body.weight) > 0) {
      updates.weight = { doubleValue: Number(body.weight) };
    }
    if (typeof body.isActive === "boolean") {
      updates.isActive = { booleanValue: body.isActive };
    }
    if (body.order !== undefined && !Number.isNaN(Number(body.order))) {
      updates.order = { integerValue: String(Math.round(Number(body.order))) };
    }

    if (Object.keys(updates).length > 0) {
      await firestoreSetDoc("kpi_parameters", id, updates);
    }

    return NextResponse.json({
      berhasil: true,
      pesan: "Parameter KPI berhasil diperbarui.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal memperbarui parameter KPI.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return NextResponse.json(
      { berhasil: false, pesan: "Akses ditolak." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    await firestoreDeleteDoc("kpi_parameters", id);
    return NextResponse.json({
      berhasil: true,
      pesan: "Parameter KPI berhasil dihapus.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        berhasil: false,
        pesan: error instanceof Error ? error.message : "Gagal menghapus parameter KPI.",
      },
      { status: 500 }
    );
  }
}