// app/timeline/[id]/page.tsx
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { format, parseISO, differenceInDays } from "date-fns";

const MAX_DATE = "9999-12-31";

async function getTimelineDetail(id: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/timeline/${id}`, {
        cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
}

export async function generateMetadata({
    params
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params; // Await the params Promise
    const timeline = await getTimelineDetail(id);

    return {
        title: timeline?.timelineInfo?.title ?? "Timeline Detail",
    };
}

export default async function TimelineDetailPage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params; // Await the params Promise
    const timeline = await getTimelineDetail(id);

    if (!timeline) return notFound();

    const { timelineInfo, episodes } = timeline;
    const startDate = parseISO(timelineInfo.start);
    const endDate = timelineInfo.end === MAX_DATE ? new Date() : parseISO(timelineInfo.end);
    const totalDays = differenceInDays(endDate, startDate);

    return (
        <main className="p-6">
            <nav className="mb-4">
                <Link href="/timelines" className="text-blue-600 hover:underline">
                    ← Back to Timelines
                </Link>
            </nav>

            <h1 className="text-2xl font-bold mb-2">{timelineInfo.title}</h1>
            <p className="text-gray-600 mb-6">{timelineInfo.subtitle}</p>

            <div className="overflow-x-auto border rounded-lg p-4 bg-gray-50">
                <div className="relative h-32 min-w-[1000px] bg-white border border-gray-300">
                    {episodes.map((ep: any) => {
                        const epStart = parseISO(ep.start);
                        const epEnd = ep.end === MAX_DATE ? new Date() : parseISO(ep.end);
                        const offsetDays = differenceInDays(epStart, startDate);
                        const widthDays = Math.max(differenceInDays(epEnd, epStart), 1);
                        const left = (offsetDays / totalDays) * 100;
                        const width = (widthDays / totalDays) * 100;

                        return (
                            <div
                                key={ep.episodeId}
                                className="absolute top-4 h-10 bg-blue-500 text-white text-xs rounded px-2 py-1 flex items-center justify-center shadow"
                                style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    minWidth: "2rem",
                                }}
                                title={`${ep.title} (${format(epStart, "yyyy-MM-dd")} - ${format(epEnd, "yyyy-MM-dd")})`}
                            >
                                {ep.title}
                            </div>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}