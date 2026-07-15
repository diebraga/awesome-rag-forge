"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectDatabaseAction } from "./connect-database-action";
import type { SavedConnectionValues } from "@/lib/connection-keychain";

type FieldKey = keyof SavedConnectionValues;

function Field({
  id,
  label,
  required,
  value,
  onChange,
  ...inputProps
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue">) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm text-black">
        {label} {required ? <span className="text-red-600">*</span> : null}{" "}
        <span className="text-black/40">{required ? "(Required)" : "(Optional)"}</span>
      </label>
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </div>
  );
}

const EMPTY_VALUES: Record<FieldKey, string> = {
  databaseUrl: "",
  storageBucket: "",
  storageAccessKeyId: "",
  storageSecretAccessKey: "",
  storageEndpoint: "",
};

export function ConnectionForm({ savedValues }: { savedValues: SavedConnectionValues }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    ...EMPTY_VALUES,
    ...savedValues,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(key: FieldKey) {
    return (value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(formData: FormData) {
    setConnecting(true);
    setError(null);
    const result = await connectDatabaseAction(formData);
    if (!result.ok) {
      setConnecting(false);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Field
        id="databaseUrl"
        label="Database URL"
        required
        type="password"
        placeholder="e.g., postgresql://user:password@localhost:5432/mydatabase"
        value={values.databaseUrl}
        onChange={setField("databaseUrl")}
      />
      <Field
        id="storageBucket"
        label="Storage Bucket Name"
        placeholder="e.g., global-knowledge-assets"
        value={values.storageBucket}
        onChange={setField("storageBucket")}
      />
      <Field
        id="storageAccessKeyId"
        label="Access Key ID"
        placeholder="e.g., AKIA1234567890EXAMPLE"
        value={values.storageAccessKeyId}
        onChange={setField("storageAccessKeyId")}
      />
      <Field
        id="storageSecretAccessKey"
        label="Secret Access Key"
        type="password"
        placeholder="········"
        value={values.storageSecretAccessKey}
        onChange={setField("storageSecretAccessKey")}
      />
      <Field
        id="storageEndpoint"
        label="Storage Endpoint"
        placeholder="e.g., https://s3.us-east-1.amazonaws.com"
        value={values.storageEndpoint}
        onChange={setField("storageEndpoint")}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs leading-5 text-black/40">
        No storage bucket keys? Uploaded files are still read and their text stored in the
        knowledge base — you just won&apos;t be able to download the original file back out later.
      </p>

      <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
        <Button type="button" variant="outline" onClick={() => setValues(EMPTY_VALUES)}>
          Clear
        </Button>
        <Button type="submit" disabled={connecting}>
          {connecting ? "Connecting…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
