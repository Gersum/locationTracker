import { Component, NgModule } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapComponent } from "./map/map.component";
import {NgForm} from "@angular/forms";

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


