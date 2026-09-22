import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getOfficerCv } from '../../api/evaluations';
import { toArabicDigits } from '../../utils/format';
import { buildCvSections, CvTabs } from '../../components/officer/OfficerCvContent';
import type { CvSection } from '../../components/officer/OfficerCvContent';
import OfficerPhoto from '../../components/member/OfficerPhoto';
import BackButton from '../../components/member/BackButton';

// Full-screen officer file (ملخص بيانات الضابط / الجزاءات والمحاكمات / ملخص الإتهام / ملخص الموضوع /
// رأى جهاز العمل النفسى), reached from the voting screen's footer. It replaces the old modal so the
// member reads the file on its own page and returns with an unmistakable back button. Access is
// still guarded server side: a member may only open an officer in their active committee.
export default function OfficerCvScreen() {
    const { officerId } = useParams();
    const [params, setParams] = useSearchParams();
    const section = params.get('section');
    const only = section === 'punishments' ? 'punishments' : undefined;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Section tabs are owned here (rendered in the header below) and the body shows only the
    // active section. The active tab is kept in the URL (?tab=<sectionId>) so it survives a page
    // reload; the id (not an index) is stored so the selection stays correct even if the section
    // set changes.
    // The case / نفسي pages are each one section, titled like the footer button that opens them
    // (ملخص الإتهام for أحكام حبس, ملخص الموضوع otherwise; رأى جهاز العمل النفسى for nafsy), with the
    // case file as the body. Every other view uses the shared CV builder unchanged.
    const sections: CvSection[] = !data ? [] : buildCvSections(data, only, true);
    const tabId = params.get('tab');
    const savedIdx = tabId ? sections.findIndex(s => s.id === tabId) : -1;
    const idx = sections.length ? (savedIdx >= 0 ? savedIdx : 0) : 0;
    const selectTab = (i: number) => {
        const id = sections[i]?.id;
        if (!id) return;
        const next = new URLSearchParams(params);
        next.set('tab', id);
        setParams(next, { replace: true });
    };

    // A long section (e.g. تقارير الكفاءة with many reports) can't always fit, so the section
    // body scrolls within itself and these arrows page it up/down. Each shows only when there
    // is somewhere to scroll that way; in this RTL layout the scrollbar sits on the left, so
    // the arrows do too. Big targets for readers around 70.
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollUp(el.scrollTop > 4);
        setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    }, []);

    const scrollByPage = (dir: 1 | -1) => {
        const el = scrollRef.current;
        if (el) el.scrollBy({ top: dir * el.clientHeight * 0.85, behavior: 'smooth' });
    };

    // Switching section (or new data) resets to the top and re-measures overflow after paint.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = 0;
        const raf = requestAnimationFrame(updateScrollState);
        return () => cancelAnimationFrame(raf);
    }, [idx, data, loading, error, updateScrollState]);

    useEffect(() => {
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [updateScrollState]);

    useEffect(() => {
        const id = Number(officerId);
        if (!Number.isInteger(id)) {
            setError('معرف الضابط غير صحيح');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        getOfficerCv(id)
            .then(setData)
            .catch(() => setError('تعذر تحميل بيانات الضابط'))
            .finally(() => setLoading(false));
    }, [officerId]);

    const h = data?.header || {};
    // Legacy header identity, unlabelled: seniority, rank and name on one line; the unit and
    // job on the next; the specialization last. Each part is dropped when it has no value.
    const line1 = [h.akdam_no, h.akdam_rep, h.rank_name, h.per_name].map(toArabicDigits).filter(Boolean).join(' ');
    const line2 = [h.unit_name, h.job_name].map(toArabicDigits).filter(Boolean).join(' / ');
    const line3 = toArabicDigits(h.spec_name);
    const idNum = Number(officerId);
    const hasOfficer = Number.isInteger(idNum);

    return (
        <div className="mx-auto flex w-full max-w-[1700px] flex-col lg:h-full lg:min-h-0">
            {/* One container: identity + section tabs on the right, portrait on the left, then a
                gap and the active section. The tabs share the top row beside the portrait so the
                header stays short and the section below fits without scrolling. */}
            <div className="flex flex-col overflow-hidden rounded-xl border-2 border-gray-300 bg-white shadow-sm lg:max-h-full">
                <div className="flex shrink-0 items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 h-full justify-between">
                        <div className="space-y-1">
                            {line1 && <p className="text-2xl font-bold text-gray-900 break-words">{line1}</p>}
                            {line2 && <p className="text-lg font-bold text-gray-800 break-words">{line2}</p>}
                            {line3 && <p className="text-lg font-bold text-gray-800 break-words">{line3}</p>}
                        </div>
                        {/* Section tabs, grouped in one bar beside the portrait. The single-section
                            case pages (ملخص الإتهام / ملخص الموضوع / رأى جهاز العمل النفسى) hide the tab —
                            it would only repeat the page's own heading. */}
                        {sections.length > 0 && (
                            <CvTabs sections={sections} active={idx} onChange={selectTab} />
                        )}
                    </div>
                    <div className="flex shrink-0 items-end gap-3">
                        <BackButton />
                        {hasOfficer && <OfficerPhoto officerId={idNum} className="aspect-[3/4] w-28 shrink-0 2xl:w-36" />}
                    </div>
                </div>

                {/* Active section, set apart from the header by a gap band. It scrolls within
                    itself on large screens; the sticky arrows page it up/down. */}
                <div
                    ref={scrollRef}
                    onScroll={updateScrollState}
                    className="border-t-4 border-gray-100 px-4 py-3 lg:min-h-0 lg:overflow-y-auto"
                >
                    {/* Up arrow: pinned to the top of the scroll viewport while content is above. */}
                    <div className="pointer-events-none sticky top-0 z-20 h-0">
                        {canScrollUp && (
                            <button
                                type="button"
                                onClick={() => scrollByPage(-1)}
                                aria-label="تمرير لأعلى"
                                className="pointer-events-auto absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-blue-800 bg-white/90 text-blue-800 shadow-lg backdrop-blur transition-colors hover:bg-blue-800 hover:text-white"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="py-12 text-center text-xl text-gray-700">جاري التحميل...</div>
                    ) : error ? (
                        <div className="py-12 text-center text-xl font-bold text-red-800">{error}</div>
                    ) : sections.length ? (
                        <div>{sections[idx].content}</div>
                    ) : (
                        <div className="py-12 text-center text-xl text-gray-700">لا توجد بيانات</div>
                    )}

                    {/* Down arrow: pinned to the bottom of the scroll viewport while more is below. */}
                    <div className="pointer-events-none sticky bottom-0 z-20 h-0">
                        {canScrollDown && (
                            <button
                                type="button"
                                onClick={() => scrollByPage(1)}
                                aria-label="تمرير لأسفل"
                                className="pointer-events-auto absolute bottom-1 left-0 flex h-12 w-12 items-center justify-center rounded-full border-2 border-blue-800 bg-white/90 text-blue-800 shadow-lg backdrop-blur transition-colors hover:bg-blue-800 hover:text-white"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
