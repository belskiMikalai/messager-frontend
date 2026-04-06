import "./ParticipantGrid.css";

export interface Participant {
  id: number;
  name: string;
  isMuted?: boolean;
}

interface ParticipantGridProps {
  participants: Participant[];
  localUserId: number;
  localStream?: MediaStream | null;
}

function getGridCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 3;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(id: number): string {
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6"
  ];
  return colors[id % colors.length];
}

export function ParticipantGrid({ participants, localUserId }: ParticipantGridProps) {
  const gridCols = getGridCols(participants.length);

  return (
    <div className="participant-grid" style={{ "--cols": gridCols } as React.CSSProperties}>
      {participants.map((participant) => {
        const isLocal = participant.id === localUserId;
        
        return (
          <div
            key={participant.id}
            className="grid-cell audio"
          >
            <div className="grid-avatar">
              <div 
                className="avatar-circle"
                style={{ backgroundColor: getAvatarColor(participant.id) }}
              >
                {getInitials(participant.name)}
              </div>
              <span className="participant-name">
                {participant.name} {isLocal && "(You)"}
              </span>
              {participant.isMuted && <span className="muted-icon">🔇</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
