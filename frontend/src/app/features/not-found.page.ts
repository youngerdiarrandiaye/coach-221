import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({standalone:true,imports:[RouterLink],template:`<section class="empty"><p class="eyebrow">404</p><h1>Cette page est introuvable.</h1><a class="button primary" routerLink="/dashboard">Retour à mon espace</a></section>`})
export class NotFoundPage {}
