type Flashcard = {
  term: string;
  definition: string;
};

type Props = {
  flashcards: Flashcard[];
  currentIndex: number;
  isFlipped: boolean;
  onFlip: () => void;
  onNext: () => void;
};

export function FlashcardDeck({ flashcards, currentIndex, isFlipped, onFlip, onNext }: Props) {
  const card = flashcards[currentIndex];

  if (!card) return null;

  return (
    <div className="flashcard-wrap">
      <div className="flashcard" onClick={onFlip}>
        <div className="flashcard-label">플래시카드</div>
        <div className="flashcard-face">
          {isFlipped ? card.definition : card.term}
        </div>
        <div className="flashcard-hint">{isFlipped ? '클릭하면 앞면으로 돌아갑니다' : '클릭하면 정의를 확인해요'}</div>
      </div>

      <div className="row flashcard-actions">
        <button className="secondary" onClick={onNext}>다음 카드</button>
      </div>
    </div>
  );
}
