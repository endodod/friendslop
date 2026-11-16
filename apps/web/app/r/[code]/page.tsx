import { RoomClient } from "@/components/RoomClient";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ display?: string }>;
}) {
  const { code } = await params;
  const { display } = await searchParams;
  return <RoomClient code={code.toUpperCase()} display={display === "1"} />;
}
