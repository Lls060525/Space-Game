from django.urls import path

from . import views

urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", views.login),
    path("auth/guest/", views.guest),
    path("auth/me/", views.me),
    path("components/", views.ComponentList.as_view()),
    path("missions/", views.MissionList.as_view()),
    path("leaderboard/", views.Leaderboard.as_view()),
    path("matches/mine/", views.MyMatches.as_view()),
    path("practice/", views.practice),
    path("quiz/practice/", views.quiz_practice),
    path("rover/scores/", views.rover_scores),
    path("nasa/conditions/", views.nasa_conditions),
    path("validation/", views.validation),
    path("class/", views.class_create),
    path("class/<str:code>/", views.class_detail),
]
