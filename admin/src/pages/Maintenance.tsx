import React from 'react'
import { Wrench, Clock } from 'lucide-react'
import './Maintenance.css'

type MaintenanceProps = {
  featureName: string
  description?: string
}

const Maintenance: React.FC<MaintenanceProps> = ({ featureName, description }) => {
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
      </div>
    </div>
  )
}

export default Maintenance

