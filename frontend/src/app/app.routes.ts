import { Routes } from '@angular/router';
import { ShellComponent } from './app.component';
import { authenticated, clientOnly } from './core/api';
const list=()=>import('./features/list.page').then(m=>m.ListPage);
const edit=()=>import('./features/edit.page').then(m=>m.EditPage);
const detail=()=>import('./features/detail.page').then(m=>m.DetailPage);
const auth=()=>import('./features/auth.page').then(m=>m.AuthPage);
export const routes:Routes=[
 {path:'',pathMatch:'full',redirectTo:'dashboard'},
 ...['login','register','reset-password','update-password','check-email'].map(mode=>({path:mode,loadComponent:auth,data:{mode}})),
 {path:'installer',loadComponent:()=>import('./features/install.page').then(m=>m.InstallPage)},
 {path:'espace',loadComponent:()=>import('./features/espace/espace-shell').then(m=>m.EspaceShell),canActivate:[clientOnly],children:[
  {path:'',pathMatch:'full',loadComponent:()=>import('./features/espace/espace-resume').then(m=>m.EspaceResume)},
  {path:'progression',loadComponent:()=>import('./features/espace/espace-progression').then(m=>m.EspaceProgression)},
  {path:'rapports',loadComponent:()=>import('./features/espace/espace-rapports').then(m=>m.EspaceRapports)}]},
 {path:'',component:ShellComponent,canActivate:[authenticated],children:[
 {path:'dashboard',loadComponent:()=>import('./features/overview.page').then(m=>m.OverviewPage)},
 {path:'stats',loadComponent:()=>import('./features/overview.page').then(m=>m.OverviewPage),data:{stats:true}},
 {path:'workouts/new',loadComponent:()=>import('./features/workout.page').then(m=>m.WorkoutPage)},
 {path:'clients/:id/performance',loadComponent:()=>import('./features/performance.page').then(m=>m.PerformancePage)},
 {path:'sessions',pathMatch:'full',loadComponent:()=>import('./features/agenda.page').then(m=>m.AgendaPage)},
 {path:'sessions/recurrences/new',loadComponent:edit,data:{kind:'recurrences'}},
 {path:'sessions/recurrences',loadComponent:list,data:{kind:'recurrences'}},
 ...['clients','sessions','payments'].flatMap(kind=>[
 {path:kind+'/new',loadComponent:edit,data:{kind}},
 {path:kind+'/:id/edit',loadComponent:edit,data:{kind}},
 {path:kind+'/:id',loadComponent:detail,data:{kind}},
 {path:kind,loadComponent:list,data:{kind}}]),
 {path:'progress/new',loadComponent:edit,data:{kind:'progress'}},
 {path:'progress/:clientId/rapport',loadComponent:()=>import('./features/report.page').then(m=>m.ReportPage)},
 {path:'progress/:clientId/new',loadComponent:edit,data:{kind:'progress'}},
 {path:'progress/:clientId',loadComponent:list,data:{kind:'progress'}},
 {path:'progress',loadComponent:list,data:{kind:'progress'}},
 {path:'profile',loadComponent:edit,data:{kind:'profile'}},
 {path:'export',loadComponent:()=>import('./features/export.page').then(m=>m.ExportPage)},
 ]},
 {path:'**',loadComponent:()=>import('./features/not-found.page').then(m=>m.NotFoundPage)}
];
