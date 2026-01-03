import { useRunSheet } from '../RunSheetContext';

export default function CADDataModal() {
  const { showCadModal, setShowCadModal, formData } = useRunSheet();
  
  if (!showCadModal) return null;
  
  const printContent = (content, title) => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ccc; padding: 8px; text-align: left; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => setShowCadModal(false)}
    >
      <div 
        className="bg-white rounded-lg w-[95%] max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-primary-color text-lg font-semibold m-0">CAD Data</h3>
          <button 
            className="bg-transparent border-none text-gray-500 hover:text-gray-800 text-2xl cursor-pointer leading-none p-0"
            onClick={() => setShowCadModal(false)}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Dispatch Report */}
          {formData.cad_raw_dispatch && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-primary-color text-sm font-semibold m-0">Dispatch Report</h4>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => printContent(formData.cad_raw_dispatch, 'Dispatch Report')}
                >
                  🖨️ Print
                </button>
              </div>
              <div 
                className="cad-html-content bg-gray-50 border border-gray-200 rounded p-3 text-sm overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: formData.cad_raw_dispatch }}
              />
            </div>
          )}

          {/* Updates */}
          {formData.cad_raw_updates && formData.cad_raw_updates.length > 0 && (
            <div className="mb-4">
              <h4 className="text-primary-color text-sm font-semibold mb-2">Updates ({formData.cad_raw_updates.length})</h4>
              {formData.cad_raw_updates.map((update, idx) => (
                <div key={idx} className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-600 text-xs">Update {idx + 1}</span>
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() => printContent(update, `Update ${idx + 1}`)}
                    >
                      🖨️
                    </button>
                  </div>
                  <div 
                    className="cad-html-content bg-gray-50 border border-gray-200 rounded p-3 text-sm overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: update }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Clear Report */}
          {formData.cad_raw_clear && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-primary-color text-sm font-semibold m-0">Clear Report</h4>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => printContent(formData.cad_raw_clear, 'Clear Report')}
                >
                  🖨️ Print
                </button>
              </div>
              <div 
                className="cad-html-content bg-gray-50 border border-gray-200 rounded p-3 text-sm overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: formData.cad_raw_clear }}
              />
            </div>
          )}

          {!formData.cad_raw_dispatch && !formData.cad_raw_clear && (
            <p className="text-gray-500 italic">No CAD data available</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button className="btn btn-primary" onClick={() => setShowCadModal(false)}>Close</button>
        </div>
      </div>
    </div>
  );
}
