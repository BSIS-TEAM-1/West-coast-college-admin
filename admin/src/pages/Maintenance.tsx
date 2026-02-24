import React from 'react'
import { Wrench, Clock, ArrowLeft } from 'lucide-react'
import './Maintenance.css'

type MaintenanceProps = {
  featureName: string
  description?: string
  onBack?: () => void
}

const Maintenance: React.FC<MaintenanceProps> = ({ featureName, description, onBack }) => {
  return (
    <div className="maintenance-container">
      <div className="maintenance-card">
        <div className="maintenance-icon-wrapper">
          <div className="maintenance-orbit" />
          <Wrench className="maintenance-icon" size={40} />
        </div>
        <h1>{featureName} under maintenance</h1>
        <p>
          {description ??
            'We are still building this section to give you a better admin experience.'}
        </p>
        <div className="maintenance-status">
          <Clock size={16} />
          <span>Feature coming soon. Thank you for your patience.</span>
        </div>
       
        <p className="maintenance-copyright">
          &copy; 2026 West Coast College All rights reserved
        </p>
         {onBack && (
          <button
            type="button"
            className="maintenance-back-btn"
            onClick={onBack}
          >
            <span className="maintenance-back-btn-icon" aria-hidden="true">
              <ArrowLeft size={16} />
            </span>
            <span className="maintenance-back-btn-label">Back to Landing Page</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default Maintenance

