import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MobileFormStepper = ({ steps, currentStep, onStepChange, onNext, onPrevious }) => {
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_-4px_rgba(15,23,42,0.12)] md:hidden"
      aria-label="Loan application progress"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirst}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Previous step"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="relative flex min-w-0 flex-1 items-center">
          {/* Continuous track behind the circles — the fill's width animates on
           * every step change, so progress visibly slides/grows instead of the
           * old per-segment color snap. left-4/right-4 line the track up with
           * the center of the first/last circle (h-8 = 32px, half = 16px = 4). */}
          <div
            className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-gray-200"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[#16A34A] transition-[width] duration-500 ease-out"
              style={{ width: steps.length > 1 ? `${(currentStep / (steps.length - 1)) * 100}%` : "0%" }}
            />
          </div>

          <div className="relative flex w-full items-center justify-between">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => onStepChange(index)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  index === currentStep
                    ? "border-[#16A34A] bg-[#16A34A] text-white"
                    : index < currentStep
                      ? "border-[#BBE3C2] bg-[#EAF7EC] text-[#166534]"
                      : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                }`}
                aria-current={index === currentStep ? "step" : undefined}
                aria-label={`Go to ${step.label}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Next step"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-bold text-gray-700">Step {currentStep + 1} of {steps.length}</p>
        <p className="text-[11px] text-gray-500">{steps[currentStep]?.label}</p>
      </div>
    </div>
  );
};

export default MobileFormStepper;
