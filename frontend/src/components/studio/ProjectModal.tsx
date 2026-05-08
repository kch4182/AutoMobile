import { Rocket, RefreshCw, Loader2, Trash2, X } from 'lucide-react';
import { studioColors as colors } from './studioTheme';

export type ProjectFormState = {
  name: string;
  packageName: string;
  mainActivity: string;
};

type LoadTarget = 'all' | 'name' | 'packageName' | 'mainActivity';

type Props = {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  form: ProjectFormState;
  onChange: (next: ProjectFormState) => void;
  onSubmit: () => void;
  isSaving: boolean;
  isFetchingCurrentAppInfo: boolean;
  onLoadCurrentAppInfo: (target: LoadTarget) => void;
  onDelete?: () => void;
};

export function ProjectModal({
  mode,
  isOpen,
  onClose,
  form,
  onChange,
  onSubmit,
  isSaving,
  isFetchingCurrentAppInfo,
  onLoadCurrentAppInfo,
  onDelete,
}: Props) {
  if (!isOpen) return null;

  const isEdit = mode === 'edit';
  const title = isEdit ? '프로젝트 수정' : '새 프로젝트 등록';
  const submitLabel = isEdit ? '저장' : '프로젝트 생성 🚀';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: 480,
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            padding: '32px 32px 24px',
            background: `linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div
                style={{
                  padding: '8px',
                  backgroundColor: 'rgba(99, 102, 241, 0.2)',
                  borderRadius: '10px',
                  display: 'flex',
                }}
              >
                <Rocket size={20} color="#818cf8" />
              </div>
              {title}
            </h3>
            <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: 500, lineHeight: 1.5 }}>
              {isEdit ? (
                <>패키지명과 메인 액티비티를 수정할 수 있습니다.</>
              ) : (
                <>
                  연결된 기기를 스캔하여 앱 정보를 자동으로 불러오거나
                  <br />
                  수동으로 패키지 정보를 입력하세요.
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              transition: 'background 0.2s',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '32px' }}>
          {!isEdit && (
            <button
              onClick={() => onLoadCurrentAppInfo('all')}
              disabled={isFetchingCurrentAppInfo}
              style={{
                width: '100%',
                marginBottom: '28px',
                padding: '16px',
                borderRadius: '16px',
                border: `1px solid ${colors.accent}`,
                background: 'linear-gradient(to right, #eff6ff, #e0e7ff)',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.2)',
                cursor: isFetchingCurrentAppInfo ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                transition: 'all 0.3s ease',
              }}
            >
              {isFetchingCurrentAppInfo ? (
                <Loader2 className="animate-spin" size={20} color={colors.accent} />
              ) : (
                <RefreshCw size={20} color={colors.accent} />
              )}
              <span style={{ fontWeight: 800, color: '#3730a3', fontSize: '15px', letterSpacing: '-0.01em' }}>
                현재 켜진 앱 정보로 자동 입력
              </span>
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.05em' }}>
                PROJECT NAME <span style={{ color: colors.red }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  readOnly
                  placeholder="우측 버튼을 눌러 앱 이름을 불러오세요"
                  value={form.name}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '12px',
                    backgroundColor: isEdit ? '#f8fafc' : '#f8fafc',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                    color: '#0f172a',
                    fontWeight: 600,
                  }}
                />
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => onLoadCurrentAppInfo('name')}
                    style={{
                      padding: '0 20px',
                      borderRadius: '12px',
                      border: 'none',
                      backgroundColor: '#1e293b',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    불러오기
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.05em' }}>
                PACKAGE NAME <span style={{ color: colors.red }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  placeholder="예: com.company.app"
                  value={form.packageName}
                  onChange={(e) => onChange({ ...form, packageName: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '12px',
                    backgroundColor: '#fff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'border 0.2s',
                  }}
                />
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => onLoadCurrentAppInfo('packageName')}
                    style={{
                      padding: '0 20px',
                      borderRadius: '12px',
                      border: `1px solid ${colors.border}`,
                      backgroundColor: '#fff',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    불러오기
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.05em' }}>MAIN ACTIVITY</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  placeholder="예: .MainActivity"
                  value={form.mainActivity}
                  onChange={(e) => onChange({ ...form, mainActivity: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '12px',
                    backgroundColor: '#fff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'border 0.2s',
                  }}
                />
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => onLoadCurrentAppInfo('mainActivity')}
                    style={{
                      padding: '0 20px',
                      borderRadius: '12px',
                      border: `1px solid ${colors.border}`,
                      backgroundColor: '#fff',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    불러오기
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '24px 32px',
            backgroundColor: '#f8fafc',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isSaving}
              style={{
                padding: '14px 0',
                border: 'none',
                backgroundColor: 'transparent',
                color: colors.red,
                fontWeight: 800,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginRight: 'auto',
              }}
            >
              <Trash2 size={16} /> 프로젝트 삭제
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              backgroundColor: '#fff',
              color: '#64748b',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
          >
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={isSaving}
            style={{
              padding: '14px 36px',
              borderRadius: '12px',
              border: 'none',
              background: `linear-gradient(135deg, ${colors.accent} 0%, #4f46e5 100%)`,
              color: '#fff',
              fontWeight: 800,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              boxShadow: `0 4px 14px 0 rgba(99, 102, 241, 0.39)`,
              transition: 'transform 0.1s, boxShadow 0.2s',
            }}
          >
            {isSaving ? '저장 중...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
