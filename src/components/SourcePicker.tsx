import { Modal, Icon, Tag } from './ui'

export function SourcePicker({ onClose, onPick }: { onClose: () => void; onPick: (source: 'offline_behaviour') => void }) {
  return (
    <Modal title="New segment" onClose={onClose}>
      <div className="modal-body">
        <p className="muted" style={{ marginBottom: 14 }}>Choose how you want to define this audience.</p>
        <div className="sources">
          <button className="source" onClick={() => onPick('offline_behaviour')}>
            <div className="icon"><Icon.Target /></div>
            <div>
              <h3>Offline behaviour <Tag tone="teal">New</Tag></h3>
              <p>Describe your campaign in plain words, or build the audience yourself from brand visits, place categories and behaviours. Use both on the same segment.</p>
            </div>
          </button>
          <button className="source" disabled title="Existing flow — not part of this prototype">
            <div className="icon"><Icon.Pin /></div>
            <div>
              <h3>Place visitors</h3>
              <p>Pick places on the map or draw a trade area and capture the devices seen there.</p>
            </div>
          </button>
          <button className="source" disabled title="Existing flow — not part of this prototype">
            <div className="icon"><Icon.Upload /></div>
            <div>
              <h3>Upload a list</h3>
              <p>Bring your own device IDs or hashed emails and enrich them with Factori data.</p>
            </div>
          </button>
          <button className="source" disabled title="Existing flow — not part of this prototype">
            <div className="icon"><Icon.Sparkle /></div>
            <div>
              <h3>Lookalike</h3>
              <p>Expand an existing segment to devices with similar real-world behaviour.</p>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  )
}
