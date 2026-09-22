import OfficerDataCard from './OfficerDataCard';

interface Props {
  committee: any;
  officer: any;
}

// The زائر canvas: the officer's data card and nothing else. No vote panel, no tally and no
// running decision — a guest follows whichever officer the committee has active and reads the
// rest through the footer's ملخص بيانات الضابط / الجزاءات والمحاكمات screens.
// It keeps the voting screens' three-track grid with the side tracks empty, so the card
// keeps exactly the width it has for a member instead of stretching across the viewport.
export default function GuestViewScreen({ committee, officer }: Props) {
  return (
    <div className="grid items-start gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:grid-cols-[19rem_minmax(0,1fr)_15rem] xl:grid-cols-[21rem_minmax(0,1fr)_17rem] 2xl:grid-cols-[23rem_minmax(0,1fr)_19rem]">
      <div aria-hidden className="hidden lg:block" />

      <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
        <OfficerDataCard committee={committee} officer={officer} />
      </div>

      <div aria-hidden className="hidden lg:block" />
    </div>
  );
}
