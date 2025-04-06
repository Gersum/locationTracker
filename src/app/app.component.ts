import { Component, NgModule } from '@angular/core';

import { MapComponent } from "./map/map.component";



@Component({
  selector: 'app-root',
  imports: [ MapComponent],
  template: `
    <app-map></app-map>
  `
})
export class AppComponent {
  title = 'location-tracker-ui';
}


