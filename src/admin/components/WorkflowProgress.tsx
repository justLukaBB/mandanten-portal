import React from 'react';
import {
  DocumentTextIcon,
  UserGroupIcon,
  CurrencyEuroIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface WorkflowProgressProps {
  currentStatus: string;
  phase: number;
  compact?: boolean;
}

const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ 
  currentStatus, 
  phase, 
  compact = false 
}) => {
  
  const workflowSteps = [
    {
      id: 'documents_processing',
      title: 'Dokumente hochladen',
      description: 'Dokumente werden verarbeitet',
      icon: DocumentTextIcon,
      phase: 1
    },
    {
      id: 'admin_review',
      title: 'Admin-Prüfung',
      description: 'Manuelle Überprüfung erforderlich',
      icon: ExclamationTriangleIcon,
      phase: 1
    },
    {
      id: 'client_confirmation',
      title: 'Mandanten-Bestätigung',
      description: 'Gläubigerliste bestätigen lassen',
      icon: UserGroupIcon,
      phase: 1
    },
    {
      id: 'creditor_contact_ready',
      title: 'Zendesk-Kontakt bereit',
      description: 'Bereit für Gläubiger-Kontaktaufnahme',
      icon: ClockIcon,
      phase: 1
    },
    {
      id: 'creditor_contact_in_progress',
      title: 'Gläubiger-Kontakt läuft',
      description: 'Warten auf Antworten der Gläubiger',
      icon: ClockIcon,
      phase: 1
    },
    {
      id: 'creditor_contact_completed',
      title: 'Phase 2 bereit',
      description: 'Pfändungsberechnung möglich',
      icon: CheckCircleIcon,
      phase: 2
    },
    {
      id: 'debt_calculation',
      title: 'Pfändungsberechnung',
      description: 'Garnierbare Beträge ermitteln',
      icon: CurrencyEuroIcon,
      phase: 2
    },
    {
      id: 'completed',
      title: 'Abgeschlossen',
      description: 'Entschuldungsplan erstellt',
      icon: CheckCircleIcon,
      phase: 2
    }
  ];

  const getCurrentStepIndex = () => {
    return workflowSteps.findIndex(step => step.id === currentStatus);
  };

  const getStepStatus = (stepIndex: number) => {
    const currentIndex = getCurrentStepIndex();
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    if (workflowSteps[stepIndex].phase <= phase) return 'upcoming';
    return 'future';
  };

  const getStepColors = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          bg: 'bg-green-600',
          border: 'border-green-600',
          text: 'text-green-600',
          icon: 'text-white'
        };
      case 'current':
        return {
          bg: 'bg-blue-600',
          border: 'border-blue-600',
          text: 'text-blue-600',
          icon: 'text-white'
        };
      case 'upcoming':
        return {
          bg: 'bg-gray-200',
          border: 'border-gray-300',
          text: 'text-gray-700',
          icon: 'text-gray-500'
        };
      default: // future
        return {
          bg: 'bg-gray-100',
          border: 'border-gray-200',
          text: 'text-gray-400',
          icon: 'text-gray-300'
        };
    }
  };

  if (compact) {
    const currentIndex = getCurrentStepIndex();
    const totalSteps = workflowSteps.filter(step => step.phase <= phase).length;
    const progress = currentIndex >= 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;

    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Fortschritt</span>
          <span className="text-gray-900 font-medium">
            {Math.round(progress)}% ({currentIndex + 1}/{totalSteps})
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-gray-500">
          {workflowSteps[currentIndex]?.title || 'Unbekannter Status'}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4">
      <nav aria-label="Progress">
        <ol className="space-y-4 md:flex md:space-y-0 md:space-x-8">
          {workflowSteps
            .filter(step => step.phase <= phase)
            .map((step, stepIndex) => {
              const status = getStepStatus(stepIndex);
              const colors = getStepColors(status);
              const IconComponent = step.icon;

              return (
                <li key={step.id} className="md:flex-1">
                  <div className={`group flex flex-col py-2 pl-4 md:pl-0 md:pt-4 md:pb-0 ${
                    status === 'current' ? 'border-l-4 md:border-l-0 md:border-t-4 border-blue-600' : ''
                  }`}>
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className={`
                          w-10 h-10 flex items-center justify-center rounded-full border-2
                          ${colors.bg} ${colors.border}
                        `}>
                          {status === 'completed' ? (
                            <CheckCircleIcon className={`w-6 h-6 ${colors.icon}`} />
                          ) : (
                            <IconComponent className={`w-6 h-6 ${colors.icon}`} />
                          )}
                        </div>
                      </div>
                      <div className="ml-4 min-w-0 flex-1">
                        <div className={`text-sm font-medium ${colors.text}`}>
                          {step.title}
                        </div>
                        <div className="text-sm text-gray-500">
                          {step.description}
                        </div>
                        {status === 'current' && (
                          <div className="mt-1">
                            <div className="flex items-center">
                              <ClockIcon className="w-4 h-4 text-blue-600 mr-1" />
                              <span className="text-xs text-blue-600 font-medium">In Bearbeitung</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
        </ol>
      </nav>
    </div>
  );
};

export default WorkflowProgress;