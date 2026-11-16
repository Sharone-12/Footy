import { Suspense } from "react"
import CompareContent from "./content"
import { CompareDna } from "@/components/compare-dna"

export default function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ players?: string; season?: string; comp?: string }>
}) {
  return (
    <>
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">
            Loading...
          </div>
        }
      >
        <CompareContent />
      </Suspense>
      <Suspense fallback={null}>
        <CompareDna searchParams={searchParams} />
      </Suspense>
    </>
  )
}
